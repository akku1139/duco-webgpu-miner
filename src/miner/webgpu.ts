import { text } from "@/lib/text.ts"
import { PoolManager, type Job } from "./pool.ts"
import { WorkerLog } from "./workerLog.ts"
import type { Config } from "@/lib/types.ts"

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
  let job: Job
  let hashHex: string = ""

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
