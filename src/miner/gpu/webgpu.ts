import { text } from "@/lib/text.ts"
import { PoolManager, type Job } from "../pool.ts"
import { WorkerLog } from "../workerLog.ts"
import type { Config } from "@/lib/types.ts"

import ducoShader from "./shaders/duco.wgsl?raw"

let pool: PoolManager
let log: WorkerLog
const mod = "gpu"

const WORKGROUP_SIZE = 256
// 262,144 nonces = 4 MiB nonce_words buffer.
// Large enough to amortize dispatch/readback overhead without making
// every real-world job spend too much time generating/uploading nonce data.
const BATCH = 1 << 18
const NOT_FOUND = 0xFFFFFFFF

const SHA1_H0 = 0x67452301
const SHA1_H1 = 0xEFCDAB89
const SHA1_H2 = 0x98BADCFE
const SHA1_H3 = 0x10325476
const SHA1_H4 = 0xC3D2E1F0
const SHA1_K0 = 0x5A827999
const SHA1_MASK = 0xFFFFFFFF

function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0
}

// Equivalent to the optimization in Duino-Coin commit 1d03f931:
// precompute the SHA-1 state for the fixed 40-byte prefix once, then copy
// that state for every nonce instead of restarting SHA-1 from the IV.
function precomputeState10(lastBytes: Uint8Array): Uint32Array {
  const w = new Uint32Array(10)
  for (let i = 0; i < 10; i++) {
    w[i] =
      (lastBytes[i * 4] << 24) |
      (lastBytes[i * 4 + 1] << 16) |
      (lastBytes[i * 4 + 2] << 8) |
      lastBytes[i * 4 + 3]
  }

  let a = SHA1_H0
  let b = SHA1_H1
  let c = SHA1_H2
  let d = SHA1_H3
  let e = SHA1_H4

  for (let i = 0; i < 10; i++) {
    const f = (b & c) | ((~b) & d)
    const q = (rotl(a, 5) + e + w[i] + SHA1_K0 + f) >>> 0
    e = d
    d = c
    c = rotl(b, 30)
    b = a
    a = q
  }

  return new Uint32Array([a, b, c, d, e])
}

function u32be(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0
}

function fixedInput(last: string): Uint32Array {
  const bytes = new TextEncoder().encode(last)
  if (bytes.length !== 40) {
    throw new Error(`last hash must encode to exactly 40 bytes, got ${bytes.length}`)
  }

  const state = precomputeState10(bytes)
  const fixed = new Uint32Array(15)
  fixed.set(state, 0)

  for (let i = 0; i < 10; i++) {
    fixed[5 + i] = u32be(bytes, i * 4)
  }

  return fixed
}

function targetWords(target: Uint8Array): Uint32Array {
  const words = new Uint32Array(5)
  for (let i = 0; i < 5; i++) {
    words[i] = u32be(target, i * 4)
  }
  return words
}

function parseTarget(targetHex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]{40}$/.test(targetHex)) {
    return null
  }

  const target = new Uint8Array(20)
  for (let i = 0; i < 20; i++) {
    target[i] = Number.parseInt(targetHex.slice(i * 2, i * 2 + 2), 16)
  }
  return target
}

// CPU-side nonce pre-encoding used by the benchmark's fastest candidate.
// Each entry is four u32 values:
//   bytes 0..11 = decimal nonce + 0x80 + zero padding
//   word 3      = SHA-1 message bit length
//
// The buffer is allocated once and reused for all batches/jobs.
function encodeNonceBuffer(out: Uint32Array, start: number, count: number): void {
  const bytes = new Uint8Array(12)

  for (let i = 0; i < count; i++) {
    const nonce = start + i
    const s = String(nonce)

    if (s.length > 10) {
      throw new Error(`nonce ${nonce} is too large for the pre-encoded path`)
    }

    bytes.fill(0)
    for (let j = 0; j < s.length; j++) {
      bytes[j] = s.charCodeAt(j)
    }
    bytes[s.length] = 0x80

    const base = i * 4
    out[base] = u32be(bytes, 0)
    out[base + 1] = u32be(bytes, 4)
    out[base + 2] = u32be(bytes, 8)
    out[base + 3] = (40 + s.length) * 8
  }
}

function submit(
  device: GPUDevice,
  pipeline: GPUComputePipeline,
  bindGroup: GPUBindGroup,
  count: number,
  resultBuffer: GPUBuffer,
): void {
  device.queue.writeBuffer(resultBuffer, 0, new Uint32Array([NOT_FOUND]))

  const encoder = device.createCommandEncoder()
  const pass = encoder.beginComputePass()
  pass.setPipeline(pipeline)
  pass.setBindGroup(0, bindGroup)
  pass.dispatchWorkgroups(Math.ceil(count / WORKGROUP_SIZE))
  pass.end()
  device.queue.submit([encoder.finish()])
}

async function findNonce(
  device: GPUDevice,
  pipeline: GPUComputePipeline,
  bindGroup: GPUBindGroup,
  resultBuffer: GPUBuffer,
  readBuffer: GPUBuffer,
  read: Uint32Array,
  batchCount: number,
): Promise<number> {
  submit(device, pipeline, bindGroup, batchCount, resultBuffer)

  const encoder = device.createCommandEncoder()
  encoder.copyBufferToBuffer(resultBuffer, 0, readBuffer, 0, 4)
  device.queue.submit([encoder.finish()])

  await readBuffer.mapAsync(GPUMapMode.READ)
  read[0] = new Uint32Array(readBuffer.getMappedRange())[0]
  readBuffer.unmap()
  return read[0]
}

addEventListener("message", async (e) => {
  if (e.data.type !== "init") return

  const c: Config = e.data.config
  log = new WorkerLog("")
  pool = await PoolManager.new(
    log,
    mod,
    "",
    c.username,
    c.rigID + " (GPU)",
    c.miningKey,
    c.noWS,
    c.baseDiff,
  )

  log.emit(mod, "Starting")
  start()
})

const start = async () => {
  if (!navigator.gpu) {
    log.emit(mod, text.color("disabled. this browser does not support WebGPU", "red"))
    return
  }

  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) {
    log.emit(mod, text.color("disabled. this browser supports webgpu but it appears disabled", "red"))
    return
  }

  const device = await adapter.requestDevice()
  device.lost.then((info) => {
    log.emit(mod, `WebGPU device was lost: ${info.message} (${info.reason})`)
  })

  const shaderModule = device.createShaderModule({ code: ducoShader })
  const shaderInfo = await shaderModule.getCompilationInfo()
  for (const message of shaderInfo.messages) {
    if (message.type === "error") {
      log.emit(mod, text.color(`shader error: ${message.message}`, "red"))
      return
    }
  }

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "uniform" },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      },
    ],
  })

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  })
  const pipeline = device.createComputePipeline({
    layout: pipelineLayout,
    compute: { module: shaderModule, entryPoint: "main" },
  })

  // Everything below is persistent across batches and jobs.
  const fixedBuffer = device.createBuffer({
    size: 15 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  const paramsBuffer = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const resultBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  const readBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })
  const nonceBuffer = device.createBuffer({
    size: BATCH * 4 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })

  const nonceData = new Uint32Array(BATCH * 4)
  const resetResult = new Uint32Array([NOT_FOUND])
  const params = new Uint32Array(8)
  const read = new Uint32Array(1)
  const encoder = new TextEncoder()

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: fixedBuffer } },
      { binding: 1, resource: { buffer: paramsBuffer } },
      { binding: 2, resource: { buffer: resultBuffer } },
      { binding: 3, resource: { buffer: nonceBuffer } },
    ],
  })

  // Explicitly keep the reused result buffer initialized.
  device.queue.writeBuffer(resultBuffer, 0, resetResult)

  while (true) {
    let job: Job

    try {
      job = await pool.getJob()
    } catch (error) {
      log.emit(mod, text.color(`failed to get job: ${String(error)}`, "red"))
      continue
    }

    try {
      const fixed = fixedInput(job.last)
      device.queue.writeBuffer(fixedBuffer, 0, fixed)
    } catch (error) {
      log.emit(mod, text.color(String(error), "yellow"))
      continue
    }

    const target = parseTarget(job.target)
    if (!target) {
      log.emit(mod, text.color(`invalid target: ${job.target}`, "yellow"))
      continue
    }

    const maxNonce = Math.floor(job.diff * 100) + 1
    let found = NOT_FOUND

    log.emit(mod, `job diff ${job.diff} (${maxNonce} nonces)`)

    for (let nonceStart = 0; nonceStart < maxNonce && found === NOT_FOUND; nonceStart += BATCH) {
      const nonceCount = Math.min(BATCH, maxNonce - nonceStart)

      // Generate nonce payload once on the CPU, then reuse the same GPU allocation.
      encodeNonceBuffer(nonceData, nonceStart, nonceCount)

      device.queue.writeBuffer(
        nonceBuffer,
        0,
        nonceData,
        0,
        nonceCount * 4,
      )

      params[0] = nonceStart
      params[1] = nonceCount
      params.set(targetWords(target), 2)
      device.queue.writeBuffer(paramsBuffer, 0, params)

      found = await findNonce(
        device,
        pipeline,
        bindGroup,
        resultBuffer,
        readBuffer,
        read,
        nonceCount,
      )

      if (found === NOT_FOUND) continue

      // GPU matches are always verified against the real SHA-1 implementation
      // before a share is submitted.
      const digestInput = encoder.encode(job.last + found.toString())
      const hash = new Uint8Array(
        await crypto.subtle.digest("SHA-1", digestInput.buffer as ArrayBuffer),
      )

      let valid = true
      for (let i = 0; i < 20; i++) {
        if (hash[i] !== target[i]) {
          valid = false
          break
        }
      }

      if (!valid) {
        log.emit(
          mod,
          text.color(`GPU result mismatch for nonce ${found}, ignored`, "yellow"),
        )
        log.emit(
          mod,
          `Debug: hash=${Array.from(hash).map((b) => b.toString(16).padStart(2, "0")).join("")}, target=${job.target}`,
        )
        found = NOT_FOUND
        continue
      }

      log.emit(mod, text.color(`found nonce ${found}`, "green"))
      log.emit(
        mod,
        `Sending share: nonce=${found}, job.last=${job.last}, target=${job.target}`,
      )
      const shareResult = await pool.sendShare(found)
      log.emit(mod, `Share result: ${shareResult.result} ${shareResult.msg}`)
    }

    if (found === NOT_FOUND) {
      log.emit(mod, text.color("no valid nonce found for this job", "yellow"))
    }
  }
}
