import { log } from "./lib/log.ts"
import { text } from "./lib/utils.ts"

import "@xterm/xterm/css/xterm.css"
import "./main.css"

import WebCryptoBE from "./miner/webcrpyto.ts?worker"

import type { Config } from "./lib/types.ts"

const main = async () => {
  log.welcome("about", "Duino-Coin WebGPU Miner v0.0.0")
  log.welcome("source code", "https://github.com/akku1139/duco-webgpu-miner")

  const params = new URL(location.href).searchParams
  const config: Config = {
    username: params.get("username") ?? "akku",
    miningKey: params.get("miningkey") ?? "None",
    rigID: params.get("rigid") ?? "Duino-Coin WebGPU Miner",
    noWS: Boolean(params.get("nows") ?? false),
  }

  log.welcome("CPU", Boolean(params.get("backend-webcrypto"))
    ? `${params.get("backend-webcrypto-threads")} threads`
    : text.color("disabled", "red")
  )

  const adapter = await navigator.gpu?.requestAdapter()
  const device = await adapter?.requestDevice()

  log.welcome("WebGPU", device
    ? text.color("Enabled", "green")
    : text.color("No device found", "red")
  )

  if(Boolean(params.get("backend-webcrypto"))) {
    for (let thread = 0; thread < Number(params.get("backend-webcrypto-threads") ?? 1); thread++) {
      log.addWorker(
        new WebCryptoBE(),
        thread,
        config,
      )
    }
  }

  if(params.get("username") === null) {
    log.emit("sys", "username is not set. login as `akku`")
    log.emit("sys", "Configure miner: https://duco-webgpu.pages.dev/config")
  }
}

main()
