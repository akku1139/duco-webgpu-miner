import { text } from "@/lib/text.ts"
import { PoolManager, type Job } from "../pool.ts"
import { WorkerLog } from "../workerLog.ts"
import type { Config } from "@/lib/types.ts"

import ducoShader from "./shaders/duco.wgsl?raw"

let pool: PoolManager

let log: WorkerLog
const mod = "gpu"

// Optimization settings
const WORKGROUP_SIZE = 256
const BATCH = 1 << 20          // 1M nonces per batch (debugging)
const NOT_FOUND = 0xFFFFFFFF

addEventListener("message", async (e) => {
  if (e.data.type === "init") {
    const c: Config = e.data.config
    const thread: string = e.data.thread
    pool = await PoolManager.new(
      log, mod, "", c.username, c.rigID + " (GPU)", c.miningKey, c.noWS,
      c.baseDiff,
    )
    log = new WorkerLog("")
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

  // Persistent buffers
  const lastBuffer = device.createBuffer({ size: 40, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
  const paramsBuffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })

  // Bind group will be created per batch with fresh result buffer

  const resetResult = new Uint32Array([NOT_FOUND])
  const encoder = new TextEncoder()
  const lastWords = new Uint32Array(10)
  const params = new Uint32Array(7)

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

    const maxNonce = Math.floor(job.diff * 100) + 1
    let found = NOT_FOUND

    log.emit(mod, `job diff ${job.diff} (${maxNonce} nonces)`)

    // Process all nonces in large batches
    let nonceStart = 0
    
    while (nonceStart < maxNonce && found === NOT_FOUND) {
      const nonceCount = Math.min(BATCH, maxNonce - nonceStart)
      
      // Create FRESH result and read buffers for this batch
      const batchResultBuffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST })
      const batchReadBuffer = device.createBuffer({ size: 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
      
      // Reset result buffer
      device.queue.writeBuffer(batchResultBuffer, 0, resetResult)
      
      // Create bind group with fresh result buffer
      const batchBindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: lastBuffer } },
          { binding: 1, resource: { buffer: paramsBuffer } },
          { binding: 2, resource: { buffer: batchResultBuffer } },
        ],
      })
      
      // Set params
      params[0] = nonceStart
      params[1] = nonceCount
      for (let i = 0; i < 5; i++) {
        params[2 + i] = (target[i * 4] << 24) | (target[i * 4 + 1] << 16) | (target[i * 4 + 2] << 8) | target[i * 4 + 3]
      }
      device.queue.writeBuffer(paramsBuffer, 0, params)

      // Dispatch
      const commandEncoder = device.createCommandEncoder()
      const pass = commandEncoder.beginComputePass()
      pass.setPipeline(pipeline)
      pass.setBindGroup(0, batchBindGroup)
      pass.dispatchWorkgroups(Math.ceil(nonceCount / WORKGROUP_SIZE))
      pass.end()

      commandEncoder.copyBufferToBuffer(batchResultBuffer, 0, batchReadBuffer, 0, 4)
      device.queue.submit([commandEncoder.finish()])

      // Wait for result
      await batchReadBuffer.mapAsync(GPUMapMode.READ)
      const result = new Uint32Array(batchReadBuffer.getMappedRange())[0]
      batchReadBuffer.unmap()

      if (result !== NOT_FOUND) {
        // Verify on CPU before accepting
        const hash = new Uint8Array(await crypto.subtle.digest("SHA-1",
          encoder.encode(job.last + result.toString()).buffer as ArrayBuffer))
        let valid = true
        for (let i = 0; i < 20; i++) {
          if (hash[i] !== target[i]) {
            valid = false
            break
          }
        }

        if (valid) {
          found = result
          log.emit(mod, text.color(`found nonce ${found}`, "green"))
          log.emit(mod, `Sending share: nonce=${found}, job.last=${job.last}, target=${job.target}`)
          const shareResult = await pool.sendShare(found)
          log.emit(mod, `Share result: ${shareResult.result} ${shareResult.msg}`)
          break  // Job done, get next job
        } else {
          log.emit(mod, text.color(`GPU result mismatch for nonce ${result}, ignored`, "yellow"))
          log.emit(mod, `Debug: hash=${Array.from(hash).map(b => b.toString(16).padStart(2, "0")).join("")}, target=${target.map(b => b.toString(16).padStart(2, "0")).join("")}`)
          // Continue searching from where we left off
        }
      }

      nonceStart += nonceCount
    }

    // If we exhausted all nonces without finding, just continue to next job
    if (found === NOT_FOUND) {
      log.emit(mod, text.color("no valid nonce found for this job", "yellow"))
    }
  }
}
