"use strict"

const color = {
  
}

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
   * 
   * @param  {Array<string | Array<string, string>} msg
   * @returns {Array<string>}
   */
  #unescape(...msg) {
    return msg.map(m => {
      if(Array.isArray(m)) {
        return m[0]
      }
      return m
    })
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
   * @param {string | Array<Array<string, string>>} msg Message
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
}



class PoolManager {
  #httpURL
  #useWS

  /**
   * Do not use it.
   * never `new PoolManager()`
   * use `await PoolManager.new()` insted
   */
  constructor({
    username, rigid, miningKey, useWS, ws
  }) {
    this.username = username
    this.rigid = rigid ?? ""
    this.miningKey = miningKey ?? "None"
    this.#useWS = useWS
    this.ws = ws
    this.baseDiff = "LOW"

    // https://github.com/revoxhere/duco-webservices/blob/master/miniminer.html#L506
    this.#httpURL = "http://51.15.127.80"
    if(location.protocol === "https") {
      this.#httpURL = "https://server.duinocoin.com"
    }
  }

  static async new(username, rigid, miningKey) {
    let useWS = true
    if(typeof window.WebSocket === void 0) {
      useWS = false
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

      const ws = new WebSocket(wsURL)
  
      // https://github.com/XelyNetwork/SpaceUnicorn/blob/main/src/client.ts#L45
      const isSuccess = await new Promise((resolve) => {
        ws.onopen = () => resolve(true)
        ws.onerror = () => resolve(false)
      })

      if(!isSuccess) {
        useWS = false
      }  
    }

    const self = new this(username, rigid, miningKey, useWS, wsConn)
    return self
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

  async getJob() {
    if(this.#useWS) {

    } else {
      await this.#sendHTTP("get", "/legacy_job", {
        u: this.username,
        i: navigator.userAgent,
        nocache: new Date.getTime()
      })
    }
  }
}

const app = document.getElementById("app")
const log = new Log()

const main = async () => {
  log.welcome("about", "Duino-Coin WebGPU Miner v0.0.0")

  const adapter = await navigator.gpu?.requestAdapter();
  const device = await adapter?.requestDevice();

  log.welcome("WebGPU", device)
  log.emit("sys", "Hi")

  if (!device) {
    log.emit("webgpu", "No device detected.")
    return
  }

  const pool = await PoolManager.new()
}

main()
