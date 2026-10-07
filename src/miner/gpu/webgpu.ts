import { text } from "@/lib/text.ts"
import { PoolManager } from "../pool.ts"
import { WorkerLog } from "../workerLog.ts"
import type { Config } from "@/lib/types.ts"
import { GpuMiner, NOT_FOUND, type GpuLane } from "./engine.ts"

let log: WorkerLog
const mod = "gpu"
const textEncoder = new TextEncoder()

function parseTarget(targetHex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]{40}$/.test(targetHex)) return null
  const target = new Uint8Array(20)
  for (let i = 0; i < 20; i++) {
    target[i] = Number.parseInt(targetHex.slice(i * 2, i * 2 + 2), 16)
  }
  return target
}

addEventListener("message", async (e) => {
  if (e.data.type !== "init") return

  const c: Config = e.data.config
  log = new WorkerLog("")
  log.emit(mod, "Starting")
  start(c)
})

const start = async (c: Config) => {
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

  let miner: GpuMiner
  try {
    miner = await GpuMiner.new(device)
  } catch (error) {
    log.emit(mod, text.color(String(error), "red"))
    return
  }

  // Each lane is an independent pool connection. While one lane waits on the
  // network (job request, share submission), the others keep the GPU busy.
  const lanes = Math.max(1, Math.floor(c.gpuLanes))
  log.emit(mod, `${lanes} lane(s)`)
  for (let i = 0; i < lanes; i++) {
    const thread = lanes === 1 ? "" : i.toString()
    PoolManager.new(log, mod, thread, c.username, c.rigID + " (GPU)", c.miningKey, c.noWS, c.baseDiff)
      .then((pool) => runLane(pool, miner.createLane()))
  }
}

const runLane = async (pool: PoolManager, lane: GpuLane) => {
  const thread = pool.thread
  while (true) {
    let job
    try {
      job = await pool.getJob()
    } catch (error) {
      log.emit(mod, text.color(`failed to get job: ${String(error)}`, "red"), thread)
      continue
    }

    const target = parseTarget(job.target)
    if (!target) {
      log.emit(mod, text.color(`invalid target: ${job.target}`, "yellow"), thread)
      continue
    }

    const maxNonce = Math.floor(job.diff * 100) + 1
    let found: number
    try {
      found = await lane.search(job.last, target, maxNonce)
    } catch (error) {
      log.emit(mod, text.color(String(error), "yellow"), thread)
      continue
    }

    if (found === NOT_FOUND) {
      log.emit(mod, text.color("no valid nonce found for this job", "yellow"), thread)
      continue
    }

    // Never submit an unverified GPU result.
    const digestInput = textEncoder.encode(job.last + found.toString())
    const hash = new Uint8Array(
      await crypto.subtle.digest("SHA-1", digestInput.buffer as ArrayBuffer),
    )
    if (!hash.every((byte, i) => byte === target[i])) {
      log.emit(mod, text.color(`GPU result mismatch for nonce ${found}, ignored`, "yellow"), thread)
      log.emit(
        mod,
        `Debug: hash=${Array.from(hash).map((b) => b.toString(16).padStart(2, "0")).join("")}, target=${job.target}`,
        thread,
      )
      continue
    }

    await pool.sendShare(found)
  }
}
