import { text } from "@/lib/text.ts"
import { PoolManager, type Job } from "../pool.ts"
import { WorkerLog } from "../workerLog.ts"
import type { Config } from "@/lib/types.ts"

import ducos1Shader from "./shaders/ducos1.wgsl?raw"

let pool: PoolManager

let log: WorkerLog
const mod = "gpu"

addEventListener("message", async (e) => {
  if(e.data.type === "init") {
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
  // https://webgpufundamentals.org/webgpu/lessons/ja/webgpu-fundamentals.html
  if (!navigator.gpu) {
    log.emit(mod, text.color("disabled. this browser does not support WebGPU", "red"))
    return
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    log.emit(mod, text.color("disabled. this browser supports webgpu but it appears disabled", "red"))
    return
  }

  const device = await adapter?.requestDevice()
  device.lost.then((info) => {
    log.emit(mod, `WebGPU device was lost: ${info.message} (${info.reason})`)

    // 'reason' will be 'destroyed' if we intentionally destroy the device.
    //if (info.reason !== "destroyed") {
      // try again
    //}
  })

  device.createShaderModule({
    code: ducos1Shader,
  })

  let job: Job
  let baseHash: Uint8Array
  let targetHash: Uint8Array
  let diff

  device.createBuffer({
    size: baseHash.length,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
  })

  const encoder = new TextEncoder()

  let i: number = 0

  while(true) {
    job = await pool.getJob()
    for(i = 0; i < job.diff * 100 + 1; i++) {

      if(hashHex === job.target) {
        await pool.sendShare(i)
        break
      }
    }
  }
  log.emit(mod, text.color("exit...", "red"))
}
