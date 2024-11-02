import { PoolManager } from "@/lib/pool.js"
import { Log } from "@/lib/log.ts"
import type { Config } from "@/lib/types.ts"

// @ts-ignore
let pool: PoolManager = void 0
let thread: number = -1

const log = new Log()

addEventListener("message", async (e) => {
  if(e.data.type === "init") {
    const c: Config = e.data.config
    pool = await PoolManager.new(
      c.username, c.rigID, c.miningKey, c.noWS,
    )
    thread = e.data.thread
  }
})

log.emit("net", JSON.stringify(await pool.getJob()))
