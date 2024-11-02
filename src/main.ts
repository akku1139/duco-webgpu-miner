import { log } from "./lib/log.ts"

import "@xterm/xterm/css/xterm.css"
import "./main.css"

const main = async () => {
  log.welcome("about", "Duino-Coin WebGPU Miner v0.0.0")
  log.welcome("source code", "https://github.com/akku1139/duco-webgpu-miner")

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
