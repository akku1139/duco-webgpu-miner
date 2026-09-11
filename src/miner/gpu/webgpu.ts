import { text } from "@/lib/text.ts"
import { PoolManager, type Job } from "../pool.ts"
import { WorkerLog } from "../workerLog.ts"
import type { Config } from "@/lib/types.ts"

import ducoShader from "./shaders/duco.wgsl?raw"

let pool: PoolManager
let log: WorkerLog
const mod = "gpu"

const WORKGROUP_SIZE = 256
// 262,144 nonces * 16 bytes = 4 MiB. This is large enough to amortize
// dispatch/readback overhead while keeping host-side preprocessing bounded.
const BATCH = 1 << 20
const NOT_FOUND = 0xFFFFFFFF

const SHA1_H0 = 0x67452301
const SHA1_H1 = 0xEFCDAB89
const SHA1_H2 = 0x98BADCFE
const SHA1_H3 = 0x10325476
const SHA1_H4 = 0xC3D2E1F0
const SHA1_K0 = 0x5A827999

function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0
}

// Precompute only the part of SHA-1 that depends solely on the fixed
// 40-byte last hash. Rounds 0..9 only consume W[0..9], so later nonce
// dependent words cannot affect this state yet.
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

  const fixed = new Uint32Array(15)
  fixed.set(precomputeState10(bytes), 0)
  for (let i = 0; i < 10; i++) {
    fixed[5 + i] = u32be(bytes, i * 4)
  }
  return fixed
}

function parseTarget(targetHex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]{40}$/.test(targetHex)) return null
  const target = new Uint8Array(20)
  for (let i = 0; i < 20; i++) {
    target[i] = Number.parseInt(targetHex.slice(i * 2, i * 2 + 2), 16)
  }
  return target
}

function targetWords(target: Uint8Array): Uint32Array {
  const words = new Uint32Array(5)
  for (let i = 0; i < 5; i++) words[i] = u32be(target, i * 4)
  return words
}

function makeDigitLut(): Uint32Array {
  const lut = new Uint32Array(10000)
  for (let i = 0; i < 10000; i++) {
    const d0 = 48 + Math.floor(i / 1000)
    const d1 = 48 + Math.floor(i / 100) % 10
    const d2 = 48 + Math.floor(i / 10) % 10
    const d3 = 48 + i % 10
    lut[i] =
      (d0 << 24) |
      (d1 << 16) |
      (d2 << 8) |
      d3
  }
  return lut
}

function decimalDigits(n: number): number {
  if (n < 10) return 1
  if (n < 100) return 2
  if (n < 1000) return 3
  if (n < 10000) return 4
  if (n < 100000) return 5
  if (n < 1000000) return 6
  if (n < 10000000) return 7
  if (n < 100000000) return 8
  if (n < 1000000000) return 9
  return 10
}

function nextDigitBoundary(n: number): number {
  if (n < 10) return 10
  if (n < 100) return 100
  if (n < 1000) return 1000
  if (n < 10000) return 10000
  if (n < 100000) return 100000
  if (n < 1000000) return 1000000
  if (n < 10000000) return 10000000
  if (n < 100000000) return 100000000
  if (n < 1000000000) return 1000000000
  return 0xFFFFFFFF
}

async function findNonce(
  device: GPUDevice,
  pipeline: GPUComputePipeline,
  bindGroup: GPUBindGroup,
  resultBuffer: GPUBuffer,
  readBuffer: GPUBuffer,
  read: Uint32Array,
  count: number,
): Promise<number> {
  device.queue.writeBuffer(resultBuffer, 0, new Uint32Array([NOT_FOUND]))

  const commandEncoder = device.createCommandEncoder()
  const pass = commandEncoder.beginComputePass()
  pass.setPipeline(pipeline)
  pass.setBindGroup(0, bindGroup)
  pass.dispatchWorkgroups(Math.ceil(count / WORKGROUP_SIZE))
  pass.end()
  commandEncoder.copyBufferToBuffer(resultBuffer, 0, readBuffer, 0, 4)
  device.queue.submit([commandEncoder.finish()])

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
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
    ],
  })

  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] })
  const pipelines = new Map<number, GPUComputePipeline>()
  const getPipeline = (digits: number): GPUComputePipeline => {
    let pipeline = pipelines.get(digits)
    if (!pipeline) {
      pipeline = device.createComputePipeline({
        layout: pipelineLayout,
        compute: {
          module: shaderModule,
          entryPoint: "main",
          constants: { NONCE_DIGITS: digits },
        },
      })
      pipelines.set(digits, pipeline)
    }
    return pipeline
  }

  // Persistent allocations: no per-batch GPUBuffer/bind-group churn.
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
  const digitLut = makeDigitLut()
  const digitLutBuffer = device.createBuffer({
    size: digitLut.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(digitLutBuffer, 0, digitLut)

  const params = new Uint32Array(8)
  const read = new Uint32Array(1)
  const encoder = new TextEncoder()

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: fixedBuffer } },
      { binding: 1, resource: { buffer: paramsBuffer } },
      { binding: 2, resource: { buffer: resultBuffer } },
      { binding: 3, resource: { buffer: digitLutBuffer } },
    ],
  })

  const resetResult = new Uint32Array([NOT_FOUND])
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
      device.queue.writeBuffer(fixedBuffer, 0, fixedInput(job.last))
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

    for (let nonceStart = 0; nonceStart < maxNonce && found === NOT_FOUND; ) {
      // Every dispatch stays inside one decimal digit range, so the shader's
      // nonce encoding path is uniform. No per-nonce CPU preprocessing occurs.
      const boundary = nextDigitBoundary(nonceStart)
      const nonceDigits = decimalDigits(nonceStart)
      const nonceCount = Math.min(
        BATCH,
        maxNonce - nonceStart,
        boundary - nonceStart,
      )

      params[0] = nonceStart
      params[1] = nonceCount
      params.set(targetWords(target), 2)
      device.queue.writeBuffer(paramsBuffer, 0, params)

      found = await findNonce(
        device,
        getPipeline(nonceDigits),
        bindGroup,
        resultBuffer,
        readBuffer,
        read,
        nonceCount,
      )

      if (found === NOT_FOUND) {
        nonceStart += nonceCount
        continue
      }

      // Never submit an unverified GPU result.
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
        log.emit(mod, text.color(`GPU result mismatch for nonce ${found}, ignored`, "yellow"))
        log.emit(
          mod,
          `Debug: hash=${Array.from(hash).map((b) => b.toString(16).padStart(2, "0")).join("")}, target=${job.target}`,
        )
        found = NOT_FOUND
        nonceStart += nonceCount
        continue
      }

      log.emit(mod, text.color(`found nonce ${found}`, "green"))
      log.emit(mod, `Sending share: nonce=${found}, job.last=${job.last}, target=${job.target}`)
      const shareResult = await pool.sendShare(found)
      log.emit(mod, `Share result: ${shareResult.result} ${shareResult.msg}`)
      nonceStart += nonceCount
    }

    if (found === NOT_FOUND) {
      log.emit(mod, text.color("no valid nonce found for this job", "yellow"))
    }
  }
}
