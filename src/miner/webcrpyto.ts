import { text } from "@/lib/text.ts"
import { PoolManager, type Job } from "./pool.ts"
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
    log.emit(mod, "Starting")
    start()
  }
})

const start = async () => {
  let job: Job
  let baseHash: Uint8Array
  let targetHash: Uint8Array
  let newData: Uint8Array
  let nonceArray: Uint8Array

  // let hashHex: string
  let hash: Uint8Array

  const encoder = new TextEncoder()

  let i: number
  let j: number

  while(true) {
    job = await pool.getJob()
    baseHash = encoder.encode(job.last)
    targetHash = new Uint8Array(job.target.match(/../g)!.map(hex => parseInt(hex, 16)))

    hashing: for(i = 0; i < job.diff * 100 + 1; i++) {
      nonceArray = encoder.encode(i.toString())

      newData = new Uint8Array(baseHash.length + nonceArray.length)
      newData.set(baseHash);
      newData.set(nonceArray, baseHash.length)

      hash = new Uint8Array(await crypto.subtle.digest("SHA-1", newData))

      for(j = 0; j < 20; j++) {
        if(baseHash[j] !== hash[j]) {
          continue hashing
        }
      }
      await pool.sendShare(i)
      break

      /** 37KH/s
      if(targetHash.every((value, index) => value === hash[index])) {
        await pool.sendShare(i)
        break
      }
      */

      /* 30 KH/s
      hashHex = Array.from(new Uint8Array(
        await crypto.subtle.digest("SHA-1", encoder.encode(
          job.last + i.toString()
        ))
      )).map(b => b.toString(16).padStart(2, "0")).join("")

      if(hashHex === job.target) {
        await pool.sendShare(i)
        break
      }
      */
    }
  }
  log.emit(mod, text.color("exit...", "red"))
}
