import { text } from "@/lib/utils.ts"
import { PoolManager, type Job, type Result } from "./pool.ts"
import { WorkerLog } from "./workerLog.ts"
import type { Config } from "@/lib/types.ts"

let pool: PoolManager

let log: WorkerLog
const mod = "cpu"

addEventListener("message", async (e) => {
  if(e.data.type === "init") {
    const c: Config = e.data.config
    const thread: string = e.data.thread
    pool = await PoolManager.new(
      log, mod, thread, c.username, c.rigID + " (CPU)", c.miningKey, c.noWS,
    )
    log = new WorkerLog(thread)
    start()
  }
})

const start = async () => {
  let job: Job
  let res: Result
  let hashHex: string
  const encoder = new TextEncoder()

  while(true) {
    job = await pool.getJob()
    log.emit("net", JSON.stringify(job))

    for(let i = 0; i < job.diff * 100 + 1; i++) {
      hashHex = Array.from(new Uint8Array(
        await crypto.subtle.digest("SHA-1", encoder.encode(
          job.last + i.toString()
        ))
      )).map(b => b.toString(16).padStart(2, "0")).join("")

      if(hashHex === job.target) {
        log.debug(`nonce: ${i}`)
        res = await pool.sendShare(i)
        // log.emit(mod, `${res.result} ${res.msg} (${res.hashrate} H/s)`)
        break
      }
    }
    // log.emit(mod, "nonce out of range...")
  }
  log.emit(mod, text.color("exit...", "red"))
}
