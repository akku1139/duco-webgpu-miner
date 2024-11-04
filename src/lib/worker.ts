import { text } from "./text.ts"
import { log } from "./log.ts"
import type { Config, Result } from "./types.ts"

const shareCount = {
  all: 0,
  accept: 0,
  reject: 0,
  block: 0,
}

export const addWorker = (worker: Worker, thread: string, config: Config) => {
  worker.postMessage({
    type: "init",
    thread,
    config,
  })
  worker.addEventListener("message", (e) => {
    switch (e.data.type) {
      case "log":
        log.write(e.data.msg)
        break
      case "share":
        shareCount.all++
        const res: Result = e.data.res
        switch (res.result) {
          case "GOOD":
            shareCount.accept++
            log.emit(
              res.mod,
              text.color(text.style.bold + "accepted", "green") +
                ` (${shareCount.accept}/${shareCount.reject}) diff ` +
                text.style.bold + res.diff + text.reset +
                " hashrate " +
                text.color(text.style.bold + res.hashrate, "syan") +
                text.style.faint + " (" + res.time + " ms)" + text.reset,
              res.thread,
            )
            break
          case "BLOCK":
            shareCount.accept++
            shareCount.block++
            log.emit(
              res.mod,
              text.color(text.style.bold + "accepted (Block found!)", "green") +
                ` (${shareCount.accept}/${shareCount.reject}) diff ` +
                text.style.bold + res.diff + text.reset +
                " hashrate " +
                text.color(text.style.bold + res.hashrate, "syan") +
                text.style.faint + " (" + res.time + " ms)" + text.reset,
              res.thread,
            )
            break
          case "BAD":
            shareCount.reject++
            log.emit(
              res.mod,
              text.color(text.style.bold + "rejected", "red") +
                ` (${shareCount.accept}/${shareCount.reject}) diff ` +
                text.style.bold + res.diff + text.reset +
                text.color(` "${res.msg}"`, "red") +
                " hashrate " +
                text.color(text.style.bold + res.hashrate, "syan") +
                text.style.faint + " (" + res.time + " ms)" + text.reset,
              res.thread,
            )
            break
        }
        break
    }
  })
  worker.addEventListener("error", (e) => {
    console.log(e)
    log.debug("error")
  })
}
