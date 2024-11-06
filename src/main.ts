import { log } from "./lib/log.ts"
import { addWorker } from "./lib/worker.ts"
import { text } from "./lib/text.ts"

import "@xterm/xterm/css/xterm.css"
import "./main.css"

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

  log.welcome("CPU", Boolean(params.get("cpu"))
    ? `${params.get("cpu-threads")} threads`
    : text.color("disabled", "red")
  )

  const adapter = await navigator.gpu?.requestAdapter()
  const device = await adapter?.requestDevice()

  log.welcome("WebGPU", device
    ? text.color("Enabled", "green")
    : text.color("No device found", "red")
  )

  if(params.get("username") === null) {
    log.emit("sys", "username is not set. login as `akku`")
    log.emit("sys", "Configure miner: https://duco-webgpu.pages.dev/config")
  }

  if(Boolean(params.get("cpu"))) {
    let cpuWorker: Worker
    switch(params.get("cpu-backend")) {
      case "webcrypto":
        cpuWorker = new Worker(new URL("./miner/cpu/webcrpyto.ts", import.meta.url), {
          type: 'module'
        })
        break
      case "asmjs":
        cpuWorker = new Worker(new URL("./miner/cpu/asmjs.ts", import.meta.url), {
          type: 'module'
        })
        break
      case "js-sha1":
        cpuWorker = new Worker(new URL("./miner/cpu/js-sha1.ts", import.meta.url), {
          type: 'module'
        })
        break
      case "wasm":
          cpuWorker = new Worker(new URL("./miner/cpu/wasm.ts", import.meta.url), {
            type: 'module'
          })
          break
    }

    for (let thread = 0; thread < Number(params.get("cpu-threads") ?? 1); thread++) {
      addWorker(
        cpuWorker,
        thread.toString(),
        config,
      )
    }
  }
}

main()
