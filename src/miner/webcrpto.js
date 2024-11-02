import { PoolManager } from "/src/lib/pool.js"


/**
 * @type {PoolManager}
 */
let pool

addEventListener("message", async (e) => {
  pool = await PoolManager.new(
    params.get("username") ?? "akku",
    params.get("miningkey") ?? "None",
    params.get("rigid") ?? "Duino-Coin WebGPU Miner",
    Boolean(params.get("nows") ?? false)
  )
})

log.emit("net", JSON.stringify(await pool.getJob()))
