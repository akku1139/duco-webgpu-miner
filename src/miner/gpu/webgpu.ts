import { text } from "@/lib/text.ts"
import { type Job, PoolManager } from "../pool.ts"
import { WorkerLog } from "../workerLog.ts"
import type { Config } from "@/lib/types.ts"

let pool: PoolManager

let log: WorkerLog
const mod = "gpu"

addEventListener("message", async (e) => {
  if (e.data.type === "init") {
    const c: Config = e.data.config
    const thread: string = e.data.thread
    pool = await PoolManager.new(
      log,
      mod,
      thread,
      c.username,
      c.rigID + " (GPU)",
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
  const hashHex: string = ""

  while (true) {
    job = await pool.getJob()
    for (let i = 0, diffCache = job.diff * 100 + 1; i < diffCache; i++) {
      if (hashHex === job.target) {
        await pool.sendShare(i)
        log.emit(mod, text.color("exit...", "red"))
        break
      }
    }
  }
}
