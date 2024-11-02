import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import type { Config } from "./types.ts"

export const text = new class {
  // https://qiita.com/PruneMazui/items/8a023347772620025ad6
  // https://gist.github.com/inexorabletash/9122583
  // noReset option?

  reset = "\x1b[0m"

  style = {
    none:   "",
    bold:   "\x1b[1m",
    faint:  "\x1b[2m",
  }

  fg = {
    none:     "",
    black:    "\x1b[30m",
    red:      "\x1b[31m",
    green:    "\x1b[32m",
    yellow:   "\x1b[33m",
    blue:     "\x1b[34m",
    magenta:  "\x1b[35m",
    syan:     "\x1b[36m",
    white:    "\x1b[37m",
  }

  bg = {
    none:     "",
    black:    "\x1b[40m",
    red:      "\x1b[41m",
    green:    "\x1b[42m",
    yellow:   "\x1b[43m",
    blue:     "\x1b[44m",
    magenta:  "\x1b[45m",
    syan:     "\x1b[46m",
    white:    "\x1b[47m",
  }

  color(text: string, fg: keyof typeof this.fg, bg: keyof typeof this.bg="none") {
    return this.fg[fg] + this.bg[bg] + text + this.reset
  }
}()

/**
 * XMRig like very cool log util
 * [2024-10-30 23:28:01.268]  net      new job from jp.moneroocean.stream:20004 diff 53371 algo rx/0 height 3270473 (5 tx)
 * [2024-10-30 23:28:07.555]  cpu      accepted (728/0) diff 53371 (731 ms)
 * [2024-10-30 23:28:07.730]  miner    speed 10s/60s/15m 1986.0 1943.3 1952.7 H/s max 2384.1 H/s
 * https://github.com/xmrig/xmrig/blob/master/src/base/io/log/Log.cpp
 */
export class Log {
  term: Terminal
  isWorker: boolean

  mod: {[key in string]: [keyof typeof text.fg, keyof typeof text.bg]} = {
    debug:  ["none", "none"],
    net:    ["white", "blue"],
    sys:    ["white", "yellow"],
    webgpu: ["white", "magenta"],
  }

  constructor(isWorker: boolean = true) {
    this.isWorker = isWorker
    if(isWorker) {
      // @ts-ignore
      this.term = void 0
    } else {
      const termElm = document.getElementById("terminal") as HTMLElement

      // https://xtermjs.org/docs/api/addons/fit/
      this.term = new Terminal()
      const fitAddon = new FitAddon()
      this.term.loadAddon(fitAddon)
      this.term.open(termElm)
      fitAddon.fit()

      window.addEventListener("resize", () => {
        fitAddon.fit()
      })
    }
    // this.write("Hello from \x1B[1;3;31mxterm.js\x1B[0m $ ")
  }

  write(msg: string) {
    if(this.isWorker) {
      postMessage({
        type: "log",
        msg
      })
    } else {
      // Console Escapesequence seem to be only supportd in Chromium lol
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1720116
      console.log(msg)
      this.term.write(msg + "\r\n")
    }
  }

  emit(module: keyof typeof this.mod, msg: string) {
    const now = new Date()
    const modData = this.mod[module]
    const ts = `[${now.getFullYear().toString().padStart(4, "0")}-${now.getMonth().toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")} ${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${text.style.faint}${now.getMilliseconds().toString().padStart(3, "0")}${text.reset}]`
    this.write(`${ts} ${text.color(text.style.bold+" "+module.padEnd(8, " "), modData[0], modData[1])} ${msg}`)
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
  }
}

export const log = new Log(false)
