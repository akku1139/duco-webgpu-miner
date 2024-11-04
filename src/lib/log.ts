import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { LogBase } from "./logBase.ts"

class Log extends LogBase {
  term: Terminal

  constructor() {
    super()

    const termElm = document.getElementById("terminal") as HTMLElement

    // https://xtermjs.org/docs/api/addons/fit/
    this.term = new Terminal()
    const fitAddon = new FitAddon()
    this.term.loadAddon(fitAddon)
    this.term.open(termElm)
    fitAddon.fit()

    addEventListener("resize", () => {
      fitAddon.fit()
    })
  }

  public write(msg: string) {
    // Console Escapesequence seem to be only supportd in Chromium lol
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1720116
    console.log(msg)
    this.term.write(msg + "\r\n")
  }
}

export const log = new Log()
