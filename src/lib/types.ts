import type { LogMod } from "./logBase.ts"

export type Config = {
  username: string,
  miningKey: string,
  rigID: string,
  noWS: boolean,
}

export type Result = {
  result: "GOOD" | "BAD" | string | "BLOCK",
  msg: string,
  hashrate: number,
  mod: LogMod,
  thread: string,
  diff: number,
  time: string,
}
