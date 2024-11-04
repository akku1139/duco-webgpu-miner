import { text } from "@/lib/text.ts"
import { type Job, PoolManager } from "../pool.ts"
import { WorkerLog } from "../workerLog.ts"
import type { Config } from "@/lib/types.ts"
import { sha1 } from "js-sha1"

let pool: PoolManager

let log: WorkerLog
const mod = "cpu"

addEventListener("message", async (e) => {
  if (e.data.type === "init") {
    const c: Config = e.data.config
    const thread: string = e.data.thread
    pool = await PoolManager.new(
      log,
      mod,
      thread,
      c.username,
      c.rigID + " (CPU)",
      c.miningKey,
      c.noWS,
    )
    log = new WorkerLog(thread)
    log.emit(mod, "Starting")
    start()
  }
})

const start = async () => {
  let job: Job
  let targetHash: Uint8Array

  // let hashHex: string
  let hash: Array<number>

  let j: number

  while (true) {
    job = await pool.getJob()
    targetHash = new Uint8Array(
      job.target.match(/../g)?.map((hex) => parseInt(hex, 16)) || [],
    )

    hashing: for (
      let i = 0, diffCache = job.diff * 100 + 1;
      i < diffCache;
      i++
    ) {
      hash = sha1.array(job.last + i.toString())

      for (j = 0; j < 20; j++) {
        if (targetHash[j] !== hash[j]) {
          continue hashing
        }
      }
      await pool.sendShare(i)
      log.emit(mod, text.color("exit...", "red"))
      break
    }
  }
}
