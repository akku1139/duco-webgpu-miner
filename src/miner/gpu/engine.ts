import ducoShader from "./shaders/duco.wgsl?raw"

export const NOT_FOUND = 0xFFFFFFFF

const WORKGROUP_SIZE = 256
// Upper bound for one dispatch. 2^22 / 256 = 16384 workgroups, well under
// the 65535 per-dimension limit.
const MAX_DISPATCH_NONCES = 1 << 22
// A group is everything encoded into one submit and checked by one readback.
// Digit-boundary segments (0-9, 10-99, ...) are tiny, so they all share the
// first group instead of costing one GPU round trip each.
const MAX_GROUP_DISPATCHES = 16
const MAX_GROUP_NONCES = 1 << 24
// Groups kept in flight per lane, so the GPU already has the next group
// queued while the host waits for the previous readback.
const SLOTS = 2
// minUniformBufferOffsetAlignment is at most 256 on every implementation.
const PARAMS_STRIDE = 256

const SHA1_H0 = 0x67452301
const SHA1_H1 = 0xEFCDAB89
const SHA1_H2 = 0x98BADCFE
const SHA1_H3 = 0x10325476
const SHA1_H4 = 0xC3D2E1F0
const SHA1_K0 = 0x5A827999
const textEncoder = new TextEncoder()

function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0
}

function u32be(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0
}

// Precompute only the part of SHA-1 that depends solely on the fixed
// 40-byte last hash. Rounds 0..9 only consume W[0..9], so later nonce
// dependent words cannot affect this state yet.
function fixedInput(lastBytes: Uint8Array): Uint32Array {
  const w = new Uint32Array(10)
  for (let i = 0; i < 10; i++) w[i] = u32be(lastBytes, i * 4)

  let a = SHA1_H0
  let b = SHA1_H1
  let c = SHA1_H2
  let d = SHA1_H3
  let e = SHA1_H4
  for (let i = 0; i < 10; i++) {
    const f = (b & c) | ((~b) & d)
    const q = (rotl(a, 5) + e + w[i] + SHA1_K0 + f) >>> 0
    e = d
    d = c
    c = rotl(b, 30)
    b = a
    a = q
  }

  const fixed = new Uint32Array(16)
  fixed.set([a, b, c, d, e], 0)
  fixed.set(w, 5)
  return fixed
}

function makeDigitLut5(): Uint32Array {
  // 100000 entries * 8 bytes = 800 KiB.
  // Each entry stores five ASCII digits as:
  //   [0..3] in word 0, [4] in low byte of word 1.
  const lut = new Uint32Array(100000 * 2)
  for (let i = 0; i < 100000; i++) {
    const d0 = 48 + Math.floor(i / 10000)
    const d1 = 48 + Math.floor(i / 1000) % 10
    const d2 = 48 + Math.floor(i / 100) % 10
    const d3 = 48 + Math.floor(i / 10) % 10
    const d4 = 48 + i % 10
    const p = i * 2
    lut[p] = (d0 << 24) | (d1 << 16) | (d2 << 8) | d3
    lut[p + 1] = d4
  }
  return lut
}

function decimalDigits(n: number): number {
  let digits = 1
  while (n >= 10 && digits < 10) {
    n = Math.floor(n / 10)
    digits++
  }
  return digits
}

type Dispatch = { start: number; count: number; digits: number }

// Splits [start, maxNonce) into dispatches that never cross a decimal digit
// boundary, then packs them into groups.
function* groups(start: number, maxNonce: number): Generator<Dispatch[]> {
  let group: Dispatch[] = []
  let groupNonces = 0
  while (start < maxNonce) {
    const digits = decimalDigits(start)
    const boundary = digits >= 10 ? 0x100000000 : 10 ** digits
    const count = Math.min(MAX_DISPATCH_NONCES, boundary - start, maxNonce - start)
    group.push({ start, count, digits })
    groupNonces += count
    start += count
    if (group.length === MAX_GROUP_DISPATCHES || groupNonces >= MAX_GROUP_NONCES) {
      yield group
      group = []
      groupNonces = 0
    }
  }
  if (group.length > 0) yield group
}

export class GpuMiner {
  device: GPUDevice
  #bindGroupLayout: GPUBindGroupLayout
  #pipelineLayout: GPUPipelineLayout
  #module: GPUShaderModule
  #pipelines = new Map<number, GPUComputePipeline>()
  #digitLutBuffer: GPUBuffer

  private constructor(device: GPUDevice, module: GPUShaderModule) {
    this.device = device
    this.#module = module
    this.#bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform", hasDynamicOffset: true } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      ],
    })
    this.#pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.#bindGroupLayout] })

    const digitLut = makeDigitLut5()
    this.#digitLutBuffer = device.createBuffer({
      size: digitLut.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(this.#digitLutBuffer, 0, digitLut)

    // Compile every digit specialization up front instead of stalling the
    // first job of each length.
    for (let digits = 1; digits <= 10; digits++) this.pipeline(digits)
  }

  /** Throws with the compiler message if the shader does not compile. */
  static async new(device: GPUDevice): Promise<GpuMiner> {
    const module = device.createShaderModule({ code: ducoShader })
    const info = await module.getCompilationInfo()
    for (const message of info.messages) {
      if (message.type === "error") throw new Error(`shader error: ${message.message}`)
    }
    return new GpuMiner(device, module)
  }

  pipeline(digits: number): GPUComputePipeline {
    let pipeline = this.#pipelines.get(digits)
    if (!pipeline) {
      pipeline = this.device.createComputePipeline({
        layout: this.#pipelineLayout,
        compute: {
          module: this.#module,
          entryPoint: "main",
          constants: { NONCE_DIGITS: digits },
        },
      })
      this.#pipelines.set(digits, pipeline)
    }
    return pipeline
  }

  /**
   * A lane owns its own buffers, so several lanes (one per pool connection)
   * can search different jobs concurrently on the same device.
   */
  createLane(): GpuLane {
    return new GpuLane(this, this.#bindGroupLayout, this.#digitLutBuffer)
  }
}

type Slot = {
  params: Uint32Array
  paramsBuffer: GPUBuffer
  resultBuffer: GPUBuffer
  readBuffer: GPUBuffer
  bindGroup: GPUBindGroup
}

const RESET_RESULT = new Uint32Array([NOT_FOUND])

export class GpuLane {
  #miner: GpuMiner
  #fixedBuffer: GPUBuffer
  #slots: Slot[]
  #target = new Uint32Array(5)

  constructor(miner: GpuMiner, layout: GPUBindGroupLayout, digitLutBuffer: GPUBuffer) {
    const device = miner.device
    this.#miner = miner
    this.#fixedBuffer = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.#slots = Array.from({ length: SLOTS }, () => {
      const paramsBuffer = device.createBuffer({
        size: PARAMS_STRIDE * MAX_GROUP_DISPATCHES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      })
      const resultBuffer = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      })
      const readBuffer = device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      })
      const bindGroup = device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: this.#fixedBuffer } },
          { binding: 1, resource: { buffer: paramsBuffer, size: 32 } },
          { binding: 2, resource: { buffer: resultBuffer } },
          { binding: 3, resource: { buffer: digitLutBuffer } },
        ],
      })
      return {
        params: new Uint32Array(PARAMS_STRIDE / 4 * MAX_GROUP_DISPATCHES),
        paramsBuffer,
        resultBuffer,
        readBuffer,
        bindGroup,
      }
    })
  }

  #submit(slot: Slot, group: Dispatch[]): Promise<number> {
    const device = this.#miner.device
    const stride = PARAMS_STRIDE / 4
    for (let i = 0; i < group.length; i++) {
      slot.params[i * stride] = group[i].start
      slot.params[i * stride + 1] = group[i].count
      slot.params.set(this.#target, i * stride + 2)
    }
    device.queue.writeBuffer(slot.paramsBuffer, 0, slot.params, 0, group.length * stride)
    device.queue.writeBuffer(slot.resultBuffer, 0, RESET_RESULT)

    const encoder = device.createCommandEncoder()
    const pass = encoder.beginComputePass()
    for (let i = 0; i < group.length; i++) {
      pass.setPipeline(this.#miner.pipeline(group[i].digits))
      pass.setBindGroup(0, slot.bindGroup, [i * PARAMS_STRIDE])
      pass.dispatchWorkgroups(Math.ceil(group[i].count / WORKGROUP_SIZE))
    }
    pass.end()
    encoder.copyBufferToBuffer(slot.resultBuffer, 0, slot.readBuffer, 0, 4)
    device.queue.submit([encoder.finish()])

    return slot.readBuffer.mapAsync(GPUMapMode.READ).then(() => {
      const value = new Uint32Array(slot.readBuffer.getMappedRange())[0]
      slot.readBuffer.unmap()
      return value
    })
  }

  /**
   * Returns the smallest nonce in [startNonce, maxNonce) whose SHA-1 of
   * `last + nonce` equals `target`, or NOT_FOUND, plus the number of nonces
   * the GPU covered. The result is not verified.
   */
  async search(last: string, target: Uint8Array, maxNonce: number, startNonce = 0): Promise<{ nonce: number, searched: number }> {
    const lastBytes = textEncoder.encode(last)
    if (lastBytes.length !== 40) {
      throw new Error(`last hash must encode to exactly 40 bytes, got ${lastBytes.length}`)
    }
    this.#miner.device.queue.writeBuffer(this.#fixedBuffer, 0, fixedInput(lastBytes))
    for (let i = 0; i < 5; i++) this.#target[i] = u32be(target, i * 4)

    const pending: Promise<number>[] = []
    let next = 0
    let found = NOT_FOUND
    let searched = 0
    for (const group of groups(startNonce, maxNonce)) {
      if (pending.length === SLOTS) {
        found = await pending.shift()!
        if (found !== NOT_FOUND) break
      }
      pending.push(this.#submit(this.#slots[next], group))
      next = (next + 1) % SLOTS
      for (const dispatch of group) searched += dispatch.count
    }

    // Groups are submitted in nonce order, so the first hit is the smallest.
    // Later groups are still drained so their read buffers get unmapped.
    for (const result of pending) {
      const value = await result
      if (found === NOT_FOUND) found = value
    }
    return { nonce: found, searched }
  }
}
