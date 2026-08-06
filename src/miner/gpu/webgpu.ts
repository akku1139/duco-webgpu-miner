import { text } from "@/lib/text.ts"
import { PoolManager, type Job } from "../pool.ts"
import { WorkerLog } from "../workerLog.ts"
import type { Config } from "@/lib/types.ts"

import ducoShader from "./shaders/duco.wgsl?raw"

let pool: PoolManager

let log: WorkerLog
const mod = "gpu"

// Nonces processed per dispatch, and dispatches submitted per readback.
const WORKGROUP_SIZE = 256
const BATCH = 1 << 20
const DISPATCHES = 4

const NOT_FOUND = 0xFFFFFFFF

addEventListener("message", async (e) => {
  if (e.data.type === "init") {
    const c: Config = e.data.config
    const thread: string = e.data.thread
    pool = await PoolManager.new(
      log, mod, thread, c.username, c.rigID + " (GPU)", c.miningKey, c.noWS,
    )
    log = new WorkerLog(thread)
    log.emit(mod, "Starting")
    start()
  }
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
    ],
  })

  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] })
  const pipeline = device.createComputePipeline({
    layout: pipelineLayout,
    compute: { module: shaderModule, entryPoint: "main" },
  })

  const lastBuffer = device.createBuffer({ size: 40, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
  const resultBuffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST })
  const readBuffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })

  // One params buffer + bind group per dispatch slot so the queue writes for a
  // later dispatch cannot overwrite the params of an earlier one.
  const params = new Uint32Array(7)
  const slots = Array.from({ length: DISPATCHES }, () => {
    const buffer = device.createBuffer({
      size: params.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: lastBuffer } },
        { binding: 1, resource: { buffer } },
        { binding: 2, resource: { buffer: resultBuffer } },
      ],
    })
    return { buffer, bindGroup }
  })

  const resetResult = new Uint32Array([NOT_FOUND])
  const encoder = new TextEncoder()
  const lastWords = new Uint32Array(10)

  while (true) {
    const job: Job = await pool.getJob()

    const last = encoder.encode(job.last)
    if (last.byteLength !== 40) {
      log.emit(mod, text.color(`unexpected last hash length: ${last.byteLength}`, "yellow"))
      continue
    }
    const lastView = new DataView(last.buffer, last.byteOffset, last.byteLength)
    for (let i = 0; i < 10; i++) {
      lastWords[i] = lastView.getUint32(i * 4, false)
    }
    device.queue.writeBuffer(lastBuffer, 0, lastWords)

    const target = job.target.match(/../g)?.map((hex) => parseInt(hex, 16))
    if (!target || target.length !== 20) {
      log.emit(mod, text.color(`invalid target: ${job.target}`, "yellow"))
      continue
    }
    for (let i = 0; i < 5; i++) {
      params[2 + i] = (target[i * 4] << 24) | (target[i * 4 + 1] << 16) | (target[i * 4 + 2] << 8) | target[i * 4 + 3]
    }

    const maxNonce = Math.floor(job.diff * 100) + 1
    let found = NOT_FOUND

    log.emit(mod, `job diff ${job.diff} (${maxNonce} nonces)`)

    for (let start = 0; start < maxNonce && found === NOT_FOUND; start += DISPATCHES * BATCH) {
      const chunk = Math.min(DISPATCHES * BATCH, maxNonce - start)
      const nDispatches = Math.ceil(chunk / BATCH)

      device.queue.writeBuffer(resultBuffer, 0, resetResult)

      const commandEncoder = device.createCommandEncoder()
      const pass = commandEncoder.beginComputePass()
      pass.setPipeline(pipeline)
      for (let d = 0; d < nDispatches; d++) {
        const nonceStart = start + d * BATCH
        const nonceCount = Math.min(BATCH, maxNonce - nonceStart)

        params[0] = nonceStart
        params[1] = nonceCount
        device.queue.writeBuffer(slots[d].buffer, 0, params)

        pass.setBindGroup(0, slots[d].bindGroup)
        pass.dispatchWorkgroups(Math.ceil(nonceCount / WORKGROUP_SIZE))
      }
      pass.end()

      commandEncoder.copyBufferToBuffer(resultBuffer, 0, readBuffer, 0, 4)
      device.queue.submit([commandEncoder.finish()])

      await readBuffer.mapAsync(GPUMapMode.READ)
      found = new Uint32Array(readBuffer.getMappedRange())[0]
      readBuffer.unmap()
    }

    if (found !== NOT_FOUND) {
      // Verify on the CPU before submitting the share.
      const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", encoder.encode(job.last + found.toString()).buffer as ArrayBuffer))
      let valid = true
      for (let i = 0; i < 20; i++) {
        if (hash[i] !== target[i]) {
          valid = false
          break
        }
      }

      if (valid) {
        log.emit(mod, text.color(`found nonce ${found}`, "green"))
        await pool.sendShare(found)
        continue // done with this job — fetch next
      } else {
        log.emit(mod, text.color(`GPU result mismatch for nonce ${found}, ignored`, "yellow"))
      }
      continue // finished searching this job — fetch next
    }
  }
}
