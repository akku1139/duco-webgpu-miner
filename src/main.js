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
   */
  constructor() {
    this.term = new Terminal()
    this.term.open(document.getElementById("terminal"))
    // this.term.write("Hello from \x1B[1;3;31mxterm.js\x1B[0m $ ")
  }

  /**
   * Write directly to log buffers
   * @param {string} msg Message
   * @returns {void}
   */
  write(msg) {
    console.log(msg)
    this.term.write(msg + "\n")
  }

  /**
   * Emit log
   * @param {string} module
   * @param {string} msg Message
   * @returns {void}
   */
  emit(module, msg) {
    const now = new Date()
    const ts = `[${now.getFullYear().toString().padStart(4, "0")}-${now.getMonth().toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")} ${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now.getMilliseconds().toString().padStart(3, "0")}]`
    this.write(`${ts}  ${module.padEnd(8, " ")} ${msg}`)
  }
}

const app = document.getElementById("app")
const logger = new Log()

logger.emit("sys", "Hi")
