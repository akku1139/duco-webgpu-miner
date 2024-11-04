import { roundAndString } from "@/lib/utils.ts"
import type { WorkerLog } from "./workerLog.ts"
import type { Result } from "@/lib/types.ts"
import type { LogMod } from "@/lib/logBase.ts"

export type Job = {
  last: string
  target: string
  diff: number
}

export class PoolManager {
  job: Job

  #httpURL: string
  #baseDiff: string
  #miningKey: string
  #useWS: boolean
  #ws: WebSocket | undefined

  #startTime: number = 0
  #threadID: number

  #minerName = "Duino-Coin WebGPU Miner 0.0"

  /**
   * Do not use it.
   * never `new PoolManager()`
   * use `await PoolManager.new()` insted
   */
  constructor(
    public log: WorkerLog,
    public mod: LogMod,
    public thread: string,
    public username: string,
    public rigid: string = "None",
    miningKey: string = "None",
    useWS: boolean,
    ws: WebSocket | undefined,
  ) {
    this.#miningKey = miningKey
    this.#useWS = useWS
    this.#ws = ws
    this.#baseDiff = "LOW"

    this.#threadID = crypto.getRandomValues(new Uint16Array(1))[0]

    this.job = {
      last: "dummy",
      target: "dummy",
      diff: 0,
    }

    // https://github.com/revoxhere/duco-webservices/blob/master/miniminer.html#L506
    this.#httpURL = "http://51.15.127.80"
    if (location.protocol === "https:") {
      this.#httpURL = "https://server.duinocoin.com"
    }

    // log.emit("net", `login as ${username}`)
  }

  static async new(
    log: WorkerLog,
    mod: LogMod,
    thread: string,
    username: string,
    rigid: string,
    miningKey: string,
    noWS: boolean,
  ) {
    let useWS = true
    /**
     * @type {WebSocket}
     */
    let ws: WebSocket | undefined
    if (noWS) {
      useWS = false
      ws = void 0
    } else if (globalThis.WebSocket === undefined) {
      useWS = false
      ws = void 0
      // log.emit("net", "Your browser is not support WebSocket. Use legacy job protocol.")
    } else {
      const wsURL = "wss://magi.duinocoin.com:8443/"

      // These servers are no longer active
      // https://github.com/VatsaDev/Mineuino/blob/main/miner.js#L19
      // if(location.protocol !== "https:") {
      //   wsURL = "ws://51.15.127.80:14808"
      // } else {
      //   wsURL = "wss://server.duinocoin.com:15808"
      // }

      const ws = new WebSocket(wsURL)

      // https://github.com/XelyNetwork/SpaceUnicorn/blob/main/src/client.ts#L45
      const isSuccess = await new Promise((resolve) => {
        ws.onopen = () => resolve(true)
        ws.onerror = () => resolve(false)
      })

      if (!isSuccess) {
        useWS = false
      } else {
        // 3.0
        // Sometimes it is not sent...?
        await new Promise((resolve) => {
          ws.onmessage = (event) => {
            resolve(event.data)
          }
          setTimeout(resolve, 1000)
        })
      }
    }

    const self = new this(
      log,
      mod,
      thread,
      username,
      rigid,
      miningKey,
      useWS,
      ws,
    )

    return self
  }

  #waitWS(msg: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.#ws) {
        reject("No WebSocket")
        return
      }

      this.#ws.onmessage = (event) => {
        resolve(event.data)
      }
      this.#ws.send(msg)
    })
  }

  async #sendHTTP(
    method: string,
    path: string,
    params: { [key: string]: string },
  ) {
    const url = new URL(
      `${path}?${new URLSearchParams(params).toString()}`,
      this.#httpURL,
    )
    return await fetch(url, {
      method,
    })
  }

  async getJob(): Promise<Job> {
    // Format
    // UserName,StartDiff,MinerKey,DucoIoT
    // https://github.com/revoxhere/duino-coin/blob/master/ESP_Code/MiningJob.h#L356C1-L362C1
    // https://github.com/revoxhere/duino-coin/wiki/Duino%27s-take-on-the-Internet-of-Things
    /*
                client.print("JOB," +
                        String(config->DUCO_USER) +
                        SEP_TOKEN + config->START_DIFF +
                        SEP_TOKEN + String(config->MINER_KEY) +
                        SEP_TOKEN + "Temp:" + String(temp) + "*C" +
                        END_TOKEN);
    */
    let res: string
    if (this.#useWS) {
      res = await this.#waitWS(
        `JOB,${this.username},${this.#baseDiff},${this.#miningKey}`,
      )
    } else {
      const now = new Date()
      res = await (await this.#sendHTTP("get", "/legacy_job", {
        u: this.username,
        i: navigator.userAgent,
        nocache: now.getTime().toString(),
      })).text()
    }

    this.#startTime = new Date().getTime()

    const data = res.split(",")
    this.job = {
      last: data[0],
      target: data[1],
      diff: Number(data[2]),
    }
    return this.job
  }

  async sendShare(nonce: number): Promise<Result> {
    // WebMiner
    // 1886458,178457.65,Official Web Miner 3.4,None,,2363
    // MiniMiner
    // https://github.com/revoxhere/duco-webservices/blob/master/miniminer.html#L534C1-L550C1
    /*
            feedback = httpPost(base_url +
            "/legacy_job?u=" + username +
            "&r=" + result +
            "&k=" + key +
            "&s=Official Mini Miner 3.2" +
            "&j=" + expected_hash +
            "&i=" + navigator.userAgent +
            "&h=" + hashrate +
            "&b=" + sharetime +
            "&nocache=" + new Date().getTime());

        if (feedback == "GOOD") {
            accepted++;
        } else {
            rejected++;
        }
    */
    // https://github.com/revoxhere/duino-coin/blob/master/Unofficial%20miners/Minimal_PC_Miner.py#L100
    // https://github.com/revoxhere/duino-coin/blob/master/Unofficial%20miners/Multithreaded_PC_Miner.py#L106
    // https://github.com/revoxhere/duino-coin/blob/master/AVR_Miner.py#L1194
    // https://github.com/revoxhere/duino-coin/blob/master/PC_Miner.py#L1187

    /* https://github.com/revoxhere/duino-coin/blob/master/ESP_Code/MiningJob.h#L288
            client.print(String(counter) +
                    SEP_TOKEN + String(hashrate) +
                    SEP_TOKEN + MINER_BANNER +
                    SPC_TOKEN + config->MINER_VER +
                    SEP_TOKEN + config->RIG_IDENTIFIER +
                    SEP_TOKEN + "DUCOID" + String(chipID) +
                    SEP_TOKEN + String(WALLET_ID) +
                    END_TOKEN);
    */

    // https://github.com/revoxhere/duino-coin/blob/master/AVR_Miner.py#L1202
    // https://github.com/revoxhere/duino-coin/blob/master/Arduino_Code/Arduino_Code.ino#L160

    // result(nonce),hashrate,miner name,identifier(rig name),DUCOID,thread id(random?)

    const timeDiff = (new Date().getTime() - this.#startTime) / 1000
    const hashrate = nonce / timeDiff

    const sendStartTime = performance.now()
    let feedback
    if (this.#useWS) {
      feedback = await this.#waitWS(
        `${nonce},${hashrate},${this.#minerName},${this.rigid},,${this.#threadID}`,
      )
    } else {
      feedback = await (await this.#sendHTTP("post", "/legacy_job", {
        u: this.username,
        r: nonce.toString(),
        k: this.#miningKey,
        s: this.#minerName,
        j: this.job.target,
        i: navigator.userAgent,
        h: hashrate.toString(),
        b: roundAndString(timeDiff, 2),
        nocache: sendStartTime.toString(),
      })).text()
    }

    // strip \n
    const f = feedback.replace(/\n$/, "").split(",")

    const res: Result = {
      result: f[0],
      msg: f[1] ?? "",
      hashrate: roundAndString(hashrate, 1) + " H/s",
      mod: this.mod,
      thread: this.thread,
      diff: this.job.diff.toString(),
      time: (Math.round(performance.now() - sendStartTime)).toString(),
    }

    postMessage({
      type: "share",
      res,
    })

    return res
  }
}
