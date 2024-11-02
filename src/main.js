//@ts-check
/// <reference types="./types/webgpu-types.d.ts" />
/// <reference types="./types/types.d.ts" />

"use strict"

const utils = {
  /**
   * @param {number} value
   * @param {number} base 10, 0.1 ...
   * @returns {number}
   */
  round(value, base) {
    return Math.round(value * base) / base
  }
}

const text = new class {
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

  /**
   * @param {string} text
   * @param {keyof typeof text.fg} fg
   * @param {keyof typeof text.bg | undefined} bg
   */
  color(text, fg, bg="none") {
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
class Log {
  /**
   * @type {{[key in string]: [keyof typeof text.fg, keyof typeof text.bg]}}
   */
  mod = {
    debug:  ["none", "none"],
    net:    ["white", "blue"],
    sys:    ["white", "yellow"],
    gpu:    ["white", "magenta"],
  }

  /**
   * Init
   * @param {string} id ID of Terminal Element
   */
  constructor(id = "terminal") {
    const termElm = document.getElementById(id)

    // https://xtermjs.org/docs/api/addons/fit/
    this.term = new Terminal()
    const fitAddon = new FitAddon.FitAddon()
    this.term.loadAddon(fitAddon)
    this.term.open(termElm)
    fitAddon.fit()

    window.addEventListener("resize", () => {
      fitAddon.fit()
    })

    this.write("Hello from \x1B[1;3;31mxterm.js\x1B[0m $ ")
  }

  /**
   * Write directly to log buffers
   * @param {string} msg Message
   * @returns {void}
   */
  write(msg) {
    // Console Escapesequence seem to be only supportd in Chromium lol
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1720116
    console.log(msg)
    this.term.write(msg + "\r\n")
  }

  /**
   * Emit log
   * @param {keyof typeof this.mod} module
   * @param {string} msg Message
   * @returns {void}
   */
  emit(module, msg) {
    const now = new Date()
    const modData = this.mod[module]
    const ts = `[${now.getFullYear().toString().padStart(4, "0")}-${now.getMonth().toString().padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")} ${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${text.style.faint}${now.getMilliseconds().toString().padStart(3, "0")}${text.reset}]`
    this.write(`${ts} ${text.color(text.style.bold+" "+module.padEnd(8, " "), modData[0], modData[1])} ${msg}`)
  }

  /**
   * Welcome message
   * @param {string} mod
   * @param {string} msg
   */
  welcome(mod, msg) {
    this.write(` ${text.color("*", "green")} ${text.style.bold + mod.toUpperCase().padEnd(12, " ") + text.reset} ${msg}`)
  }

  debug(msg) {
    this.emit("debug", msg)
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

  if (!device) {
    log.emit("webgpu", "No device detected. stopping...")
    return
  }

}

main()
