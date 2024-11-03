import type { Config } from "./types.ts"
import { text } from "./utils.ts"

/**
 * XMRig like very cool log util
 * [2024-10-30 23:28:01.268]  net      new job from jp.moneroocean.stream:20004 diff 53371 algo rx/0 height 3270473 (5 tx)
 * [2024-10-30 23:28:07.555]  cpu      accepted (728/0) diff 53371 (731 ms)
 * [2024-10-30 23:28:07.730]  miner    speed 10s/60s/15m 1986.0 1943.3 1952.7 H/s max 2384.1 H/s
 * https://github.com/xmrig/xmrig/blob/master/src/base/io/log/Log.cpp
 */
export class LogBase {
  suffix

  // bad type
  mod: {[key in string]: [keyof typeof text.fg, keyof typeof text.bg]} = {
    debug:  ["none", "none"],
    net:    ["white", "blue"],
    sys:    ["white", "yellow"],
    cpu:    ["white", "green"],
    gpu:    ["white", "magenta"],
  }

  constructor(suffix: string = "") {
    this.suffix = suffix
  }

  write(msg: string) {
  }

  emit(module: keyof typeof this.mod, msg: string) {
    const now = new Date()
    const modData = this.mod[module]
    const ts = `[${now.getFullYear().toString().padStart(4, "0")}-${now.getMonth().toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")} ${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${text.style.faint}${now.getMilliseconds().toString().padStart(3, "0")}${text.reset}]`
    this.write(`${ts} ${text.color(text.style.bold+" "+(module+this.suffix).padEnd(8, " "), modData[0], modData[1])} ${msg}`)
  }

  welcome(mod: string, msg: string) {
    this.write(` ${text.color("*", "green")} ${text.style.bold + mod.toUpperCase().padEnd(12, " ")} ${msg}`)
  }

  debug(msg: string) {
    this.emit("debug", msg)
  }

  /**
   * Although it is not originally Logger's job, it also initializes Worker.
   */
  addWorker(worker: Worker, thread: number, config: Config) {
    worker.postMessage({
      type: "init",
      thread,
      config,
    })
    worker.addEventListener("message", (e) => {
      if(e.data.type === "log") {
        this.write(e.data.msg)
      }
    })
    worker.addEventListener("error", (e) => {
      console.log(e)
      this.debug("error")
    })
  }
}
