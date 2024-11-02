import { PoolManager, type Job } from "@/lib/pool.ts"
import { WorkerLog } from "./workerLog.ts"
import type { Config } from "@/lib/types.ts"

let pool: PoolManager
let thread: number

const log = new WorkerLog()

addEventListener("message", async (e) => {
  if(e.data.type === "init") {
    const c: Config = e.data.config
    pool = await PoolManager.new(
      c.username, c.rigID, c.miningKey, c.noWS,
    )
    thread = e.data.thread
    start()
  }
})

const start = async () => {
  let job: Job
  let hashHex: string
  const encoder = new TextEncoder()

  while(true) {
    job = await pool.getJob()
    log.emit("net", JSON.stringify(job))
    log.debug(`Web Crypto thread ${thread}`)

    for(let i = 0; i < job.diff * 100 + 1; i++) {
      hashHex = Array.from(new Uint8Array(
        await crypto.subtle.digest("SHA-1", encoder.encode(
          job.last + i.toString()
        ))
      )).map(b => b.toString(16).padStart(2, "0")).join("")

      if(hashHex === job.target) {
        pool.sendShare(i).then(res => {
          log.emit(`cpu ${thread}`, `${res.feedback} (${res.hashrate} H/s)`)
        })
        break
      }
    }
  }
}
