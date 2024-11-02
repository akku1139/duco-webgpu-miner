import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"

/**
 * XMRig like very cool log util
 * [2024-10-30 23:28:01.268]  net      new job from jp.moneroocean.stream:20004 diff 53371 algo rx/0 height 3270473 (5 tx)
 * [2024-10-30 23:28:07.555]  cpu      accepted (728/0) diff 53371 (731 ms)
 * [2024-10-30 23:28:07.730]  miner    speed 10s/60s/15m 1986.0 1943.3 1952.7 H/s max 2384.1 H/s
 * https://github.com/xmrig/xmrig/blob/master/src/base/io/log/Log.cpp
 */
class Log {
  term: Terminal

  mod: {[key in string]: [keyof typeof text.fg, keyof typeof text.bg]} = {
    debug:  ["none", "none"],
    net:    ["white", "blue"],
    sys:    ["white", "yellow"],
    webgpu:    ["white", "magenta"],
  }

  /**
   * Init
   * @param {string} id ID of Terminal Element
   */
  constructor(id = "terminal") {
    const termElm = document.getElementById(id) as HTMLElement

    // https://xtermjs.org/docs/api/addons/fit/
    this.term = new Terminal()
    const fitAddon = new FitAddon()
    this.term.loadAddon(fitAddon)
    this.term.open(termElm)
    fitAddon.fit()

    window.addEventListener("resize", () => {
      fitAddon.fit()
    })

    // this.write("Hello from \x1B[1;3;31mxterm.js\x1B[0m $ ")
  }

  write(msg: string) {
    // Console Escapesequence seem to be only supportd in Chromium lol
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1720116
    console.log(msg)
    this.term.write(msg + "\r\n")
  }

  emit(module: keyof typeof this.mod, msg: string) {
    const now = new Date()
    const modData = this.mod[module]
    const ts = `[${now.getFullYear().toString().padStart(4, "0")}-${now.getMonth().toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")} ${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${text.style.faint}${now.getMilliseconds().toString().padStart(3, "0")}${text.reset}]`
    this.write(`${ts} ${text.color(text.style.bold+" "+module.padEnd(8, " "), modData[0], modData[1])} ${msg}`)
  }

  welcome(mod: string, msg: string) {
    this.write(` ${text.color("*", "green")} ${text.style.bold + mod.toUpperCase().padEnd(12, " ") + text.reset} ${msg}`)
  }

  debug(msg: string) {
    this.emit("debug", msg)
  }
}

export const log = new Log()
