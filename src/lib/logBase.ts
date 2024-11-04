import { text } from "./text.ts"

// bad type
const mod = {
  debug: ["none", "none"],
  net: ["white", "blue"],
  sys: ["white", "yellow"],
  cpu: ["white", "green"],
  gpu: ["white", "magenta"],
} as const satisfies {
  [key: string]: [keyof typeof text.fg, keyof typeof text.bg]
}

export type LogMod = keyof typeof mod

/**
 * XMRig like very cool log util
 * [2024-10-30 23:28:01.268]  net      new job from jp.moneroocean.stream:20004 diff 53371 algo rx/0 height 3270473 (5 tx)
 * [2024-10-30 23:28:07.555]  cpu      accepted (728/0) diff 53371 (731 ms)
 * [2024-10-30 23:28:07.730]  miner    speed 10s/60s/15m 1986.0 1943.3 1952.7 H/s max 2384.1 H/s
 * https://github.com/xmrig/xmrig/blob/master/src/base/io/log/Log.cpp
 */
export abstract class LogBase {
  suffix

  constructor(suffix: string = "") {
    this.suffix = suffix
  }

  abstract write(msg: string): void

  public time(msg: string) {
    const now = new Date()
    const ts = `[${now.getFullYear().toString().padStart(4, "0")}-${
      now.getMonth().toString().padStart(2, "0")
    }-${now.getDate().toString().padStart(2, "0")} ${
      now.getHours().toString().padStart(2, "0")
    }:${now.getMinutes().toString().padStart(2, "0")}:${
      now.getSeconds().toString().padStart(2, "0")
    }.${text.style.faint}${
      now.getMilliseconds().toString().padStart(3, "0")
    }${text.reset}]`
    this.write(`${ts} ${msg}`)
  }

  public emit(
    module: LogMod,
    msg: string,
    suffix: string | undefined = void 0,
  ) {
    const modData = mod[module]
    this.time(
      `${
        text.color(
          text.style.bold + " " +
            (module + (suffix ?? this.suffix)).padEnd(8, " "),
          modData[0],
          modData[1],
        )
      } ${msg}`,
    )
  }

  public welcome(mod: string, msg: string) {
    this.write(
      ` ${text.color("*", "green")} ${
        text.style.bold + mod.toUpperCase().padEnd(12, " ")
      } ${msg}`,
    )
  }

  public debug(msg: string) {
    this.emit("debug", msg)
  }
}
