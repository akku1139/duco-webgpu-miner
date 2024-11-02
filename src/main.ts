import { log } from "./lib/log.ts"

import "@xterm/xterm/css/xterm.css"
import "./main.css"

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

  color(text: string, fg: keyof typeof this.fg, bg: keyof typeof this.bg="none") {
    return this.fg[fg] + this.bg[bg] + text + this.reset
  }
}()

const main = async () => {
  log.welcome("about", "Duino-Coin WebGPU Miner v0.0.0")

  if(!navigator.gpu) {
    log.emit("webgpu", "Yout browser is not suppoting WebGPU. stopping...")
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
