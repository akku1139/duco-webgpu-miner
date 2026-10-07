import { text } from "@/lib/text.ts"
import { addSIPrefix } from "@/lib/utils.ts"
import { PoolManager, type Job } from "../pool.ts"
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
  log.emit(mod, `${lanes} lane(s), pipelined share submission ${c.gpuPipeline ? "on" : "off"}`)
  for (let i = 0; i < lanes; i++) {
    const thread = lanes === 1 ? "" : i.toString()
    PoolManager.new(log, mod, thread, c.username, c.rigID + " (GPU)", c.miningKey, c.noWS, c.baseDiff)
      .then((pool) => runLane(pool, miner.createLane(), c.gpuPipeline))
  }
  setInterval(() => reportStats(lanes), STATS_INTERVAL_MS)
}

const STATS_INTERVAL_MS = 30_000
const RETRY_DELAY_MS = 5_000
const SLOW_EXCHANGE_MS = 15_000
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Aggregated over all lanes and reset on every report.
const stats = { jobs: 0, searched: 0, gpuMs: 0, networkMs: 0, since: performance.now() }

const reportStats = (lanes: number) => {
  const now = performance.now()
  const seconds = (now - stats.since) / 1000
  if (stats.jobs > 0) {
    log.emit(
      mod,
      `speed ${addSIPrefix(stats.searched / seconds, " ")}H/s, ${stats.jobs} jobs, ` +
      `per job: gpu ${(stats.gpuMs / stats.jobs).toFixed(1)} ms, ` +
      `network ${(stats.networkMs / stats.jobs).toFixed(1)} ms (${lanes} lanes)`,
    )
  }
  Object.assign(stats, { jobs: 0, searched: 0, gpuMs: 0, networkMs: 0, since: now })
}

const runLane = async (pool: PoolManager, lane: GpuLane, pipeline: boolean) => {
  const thread = pool.thread

  // Returns the next job, submitting `share` first when there is one.
  const exchange = async (share: number | null): Promise<Job> => {
    const startedAt = performance.now()
    const slow = setTimeout(() => {
      log.emit(mod, text.color(
        `no reply from pool for ${SLOW_EXCHANGE_MS / 1000}s` + (pipeline ? " (try gpu-pipeline=false)" : ""),
        "yellow",
      ), thread)
    }, SLOW_EXCHANGE_MS)
    try {
      while (true) {
        try {
          if (share === null) return await pool.getJob()
          if (pipeline) return await pool.sendShareAndGetJob(share)
          await pool.sendShare(share)
          share = null
        } catch (error) {
          log.emit(mod, text.color(`pool error: ${String(error)}`, "red"), thread)
          share = null
          await sleep(RETRY_DELAY_MS)
        }
      }
    } finally {
      clearTimeout(slow)
      stats.networkMs += performance.now() - startedAt
    }
  }

  let job = await exchange(null)
  while (true) {
    const target = parseTarget(job.target)
    if (!target) {
      if (job.last.includes("Too many workers")) {
        log.emit(mod, text.color("pool refused this lane: Too many workers. lower gpu-lanes", "red"), thread)
        return
      }
      log.emit(mod, text.color(`invalid job: ${job.last}`, "yellow"), thread)
      await sleep(RETRY_DELAY_MS)
      job = await exchange(null)
      continue
    }

    const maxNonce = Math.floor(job.diff * 100) + 1
    const startedAt = performance.now()
    let found: number
    try {
      const result = await lane.search(job.last, target, maxNonce)
      found = result.nonce
      stats.searched += result.searched
    } catch (error) {
      log.emit(mod, text.color(String(error), "yellow"), thread)
      job = await exchange(null)
      continue
    }
    stats.gpuMs += performance.now() - startedAt
    stats.jobs++

    if (found === NOT_FOUND) {
      log.emit(mod, text.color("no valid nonce found for this job", "yellow"), thread)
      job = await exchange(null)
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
      job = await exchange(null)
      continue
    }

    job = await exchange(found)
  }
}
