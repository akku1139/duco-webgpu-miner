import { PoolManager } from "@/lib/pool.ts"
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
  log.emit("net", JSON.stringify(await pool.getJob()))
  log.debug(`Web Crypto thread ${thread}`)
}
