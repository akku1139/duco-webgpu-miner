import { log } from "./lib/log.ts"

import "@xterm/xterm/css/xterm.css"
import "./main.css"

import type { Config } from "./lib/types.ts"

const main = async () => {
  log.welcome("about", "Duino-Coin WebGPU Miner v0.0.0")
  log.welcome("source code", "https://github.com/akku1139/duco-webgpu-miner")

  const adapter = await navigator.gpu?.requestAdapter()
  const device = await adapter?.requestDevice()

  log.welcome("WebGPU", device?.label ?? "No device found")

  const params = new URL(location.href).searchParams
  if(params.get("username") === null) {
    log.emit("sys", "username is not set. login as `akku`")
    log.emit("sys", "Configure miner: https://duco-webgpu.pages.dev/config")
  }

  const config: Config = {
    username: params.get("username") ?? "akku",
    miningKey: params.get("miningkey") ?? "None",
    rigID: params.get("rigid") ?? "Duino-Coin WebGPU Miner",
    noWS: Boolean(params.get("nows") ?? false),
  }

  // WebWorker in Farm
  // https://github.com/farm-fe/farm/blob/30a70a9c0dd3db5c01b37c845175ba0239369fe1/crates/core/src/plugin/mod.rs#L310
  // https://github.com/farm-fe/farm/issues/10

  if(Boolean(params.get("backend-webcrypto"))) {
    for (let thread = 0; thread < Number(params.get("backend-webcrypto-threads") ?? 1); thread++) {
      log.addWorker(
        new Worker(new URL("./miner/webcrpyto.ts", import.meta.url), {type: "module"}),
        thread,
        config,
      )
    }
  }
}

main()
