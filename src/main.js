//@ts-check
/// <reference types="./webgpu-types.d.ts" />
/// <reference types="./types.d.ts" />

"use strict"

/**
 * XMRig like very cool log util
 * [2024-10-30 23:28:01.268]  net      new job from jp.moneroocean.stream:20004 diff 53371 algo rx/0 height 3270473 (5 tx)
 * [2024-10-30 23:28:07.555]  cpu      accepted (728/0) diff 53371 (731 ms)
 * [2024-10-30 23:28:07.730]  miner    speed 10s/60s/15m 1986.0 1943.3 1952.7 H/s max 2384.1 H/s
 * https://github.com/xmrig/xmrig/blob/master/src/base/io/log/Log.cpp
 */
class Log {
  /**
   * Init
   * @param {string} id ID of Terminal Element
   */
  constructor(id = "terminal") {
    this.term = new Terminal()
    this.term.open(document.getElementById(id))
    // this.term.write("Hello from \x1B[1;3;31mxterm.js\x1B[0m $ ")
  }

  /**
   * Write directly to log buffers
   * @param {string} msg Message
   * @returns {void}
   */
  write(msg) {
    console.log(msg)
    this.term.write(msg + "\r\n")
  }

  /**
   * Emit log
   * @param {string} module
   * @param {Array<string>} msg Message
   * @returns {void}
   */
  emit(module, ...msg) {
    const now = new Date()
    const ts = `[${now.getFullYear().toString().padStart(4, "0")}-${now.getMonth().toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")} ${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now.getMilliseconds().toString().padStart(3, "0")}]`
    this.write(`${ts}  ${module.padEnd(8, " ")} ${msg}`)
  }

  /**
   * Welcome message
   * @param {string} mod
   * @param {string} msg
   */
  welcome(mod, msg) {
    this.write(` * ${mod.toUpperCase().padEnd(12, " ")} ${msg}`)
  }

  debug(...msg) {
    this.emit("debug", msg)
  }
}

/**
 * @typedef {{
 *  last: string
 *  target: string
 *  diff: number
 * }} Job
 */

class PoolManager {
  #httpURL
  #useWS
  #ws
  #baseDiff
  #miningKey

  #minerName = "Duino-Coin WebGPU Miner 0.0"

  /**
   * Do not use it.
   * never `new PoolManager()`
   * use `await PoolManager.new()` insted
   *
   * @param {string} username
   * @param {string} rigid
   * @param {string} miningKey
   * @param {boolean} useWS
   * @param {WebSocket} ws
   */
  constructor(username, rigid, miningKey, useWS, ws) {
    this.username = username
    this.rigid = rigid ?? ""
    this.#miningKey = miningKey ?? "None"
    this.#useWS = useWS
    this.#ws = ws
    this.#baseDiff = "LOW"

    this.job = {
      last: "",
      target: "",
      diff: 0,
    }

    // https://github.com/revoxhere/duco-webservices/blob/master/miniminer.html#L506
    this.#httpURL = "http://51.15.127.80"
    if(location.protocol === "https:") {
      this.#httpURL = "https://server.duinocoin.com"
    }

    log.emit("net", `login as ${username}`)
  }

  static async new(username, rigid, miningKey, noWS) {
    let useWS = true
    /**
     * @type {WebSocket}
     */
    let ws
    if(noWS) {
      useWS = false
      ws = void 0
    } else if(typeof window.WebSocket === void 0) {
      useWS = false
      ws = void 0
      log.emit("net", "Your browser is not support WebSocket. Use legacy job protocol.")
    } else {
      let wsURL = "wss://magi.duinocoin.com:8443/"

      // These servers are no longer active
      // https://github.com/VatsaDev/Mineuino/blob/main/miner.js#L19
      // if(location.protocol !== "https:") {
      //   wsURL = "ws://51.15.127.80:14808"
      // } else {
      //   wsURL = "wss://server.duinocoin.com:15808"
      // }

      ws = new WebSocket(wsURL)

      // https://github.com/XelyNetwork/SpaceUnicorn/blob/main/src/client.ts#L45
      const isSuccess = await new Promise((resolve) => {
        ws.onopen = () => resolve(true)
        ws.onerror = () => resolve(false)
      })

      if(!isSuccess) {
        useWS = false
      } else {
        // 3.0
        await new Promise((resolve) => {
          ws.onmessage = (event) => {
            resolve(event.data)
          }
        })
      }
    }

    const self = new this(username, rigid, miningKey, useWS, ws)
    return self
  }

  /**
   * @param {string} msg
   * @returns {Promise<string>}
   */
  async #waitWS(msg) {
    return new Promise((resolve) => {
      this.#ws.send(msg);
      this.#ws.onmessage = (event) => {
        resolve(event.data)
      }
    })
  }

  /**
   *
   * @param {string} method GET POST etc...
   * @param {string} path /path/to/content
   * @param {[key: string]: string} params HTTP Query Parameters
   */
  async #sendHTTP(method, path, params) {
    const url = new URL(`${path}?${
      new URLSearchParams(params).toString()
    }`, this.#httpURL)
    return await fetch(url, {
      method
    })
  }

  /**
   * @returns {Promise<Job>}
   */
  async getJob() {
    let res
    if(this.#useWS) {
      res = await this.#waitWS(`JOB,${this.username},${this.#baseDiff},${this.#miningKey}`)
    } else {
      const now = new Date()
      res = await (await this.#sendHTTP("get", "/legacy_job", {
        u: this.username,
        i: navigator.userAgent,
        nocache: now.getTime() + now.getMilliseconds()
      })).text()
    }
    const job = res.split(",")
    return {
      last: job[0],
      target: job[1],
      diff: Number(job[2]),
    }
  }

  async sendShare(nonce) {
    // WebMiner
    // 1886458,178457.65,Official Web Miner 3.4,None,,2363
    // MiniMiner
    // https://github.com/revoxhere/duco-webservices/blob/master/miniminer.html#L534C1-L550C1
    /*
            feedback = httpPost(base_url +
            "/legacy_job?u=" + username +
            "&r=" + result +
            "&k=" + key +
            "&s=Official Mini Miner 3.2" +
            "&j=" + expected_hash +
            "&i=" + navigator.userAgent +
            "&h=" + hashrate +
            "&b=" + sharetime +
            "&nocache=" + new Date().getTime());

        if (feedback == "GOOD") {
            accepted++;
        } else {
            rejected++;
        }
    */

  }
}

const app = document.getElementById("app")
const log = new Log()

const main = async () => {
  log.welcome("about", "Duino-Coin WebGPU Miner v0.0.0")

  if(!navigator.gpu) {
    log.emit("gpu", "Yout browser is not suppoting WebGPU. stopping...")
    return
  }

  const adapter = await navigator.gpu?.requestAdapter()
  const device = await adapter?.requestDevice()

  log.welcome("WebGPU", device?.label ?? "No device found")
  log.emit("sys", "Hi")

  const params = new URL(location.href).searchParams
  if(params.get("username") === null) {
    log.emit("sys", "username is not set. login as `akku`")
    log.emit("sys", "How to use: https://duco-webgpu.pages.dev/?username={DucoUserName}&miningkey={MiningKey}&rigid={RigID}")
  }
  const pool = await PoolManager.new(
    params.get("username") ?? "akku",
    params.get("miningkey") ?? "None",
    params.get("rigid") ?? "Duino-Coin WebGPU Miner",
    Boolean(params.get("nows") ?? false)
  )

  if (!device) {
    log.emit("webgpu", "No device detected. stopping...")
    return
  }

  log.emit("net", JSON.stringify(await pool.getJob()))
}

main()
