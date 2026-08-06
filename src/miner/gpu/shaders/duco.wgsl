// Duino-Coin SHA-1 compute shader
//
// Each invocation searches one nonce.
// The message is: previous hash (40 ASCII bytes) + nonce (ASCII decimal digits),
// which always fits in a single 64-byte SHA-1 block.
//
// The block is built on the GPU from `last` and the nonce:
//   bytes  0..39  previous hash
//   bytes 40..    nonce digits
//   then   0x80, zeros, and the 16-bit message length (bytes 62..63)
//
// On a match with the target, the nonce is stored with atomicMin so the
// smallest matching nonce wins. The result buffer must be reset to
// 0xFFFFFFFF before each batch.
//
// SHA-1 core based on the verified shader in note/webgpu_deepseek_v4_pro.html

struct Params {
  start_nonce: u32,
  num_nonces: u32,
  target0: u32,
  target1: u32,
  target2: u32,
  target3: u32,
  target4: u32,
};

@group(0) @binding(0) var<storage, read> last: array<u32, 10>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read_write> result: array<atomic<u32>>;

fn rotl(x: u32, n: u32) -> u32 {
  return (x << n) | (x >> (32u - n));
}

fn pack4(b0: u32, b1: u32, b2: u32, b3: u32) -> u32 {
  return (b0 << 24u) | (b1 << 16u) | (b2 << 8u) | b3;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = gid.x;
  if (id >= params.num_nonces) {
    return;
  }
  let nonce = params.start_nonce + id;

  // The 64-byte block as 16 big-endian words.
  var w: array<u32, 16>;

  // Bytes 0..39: previous hash (uploaded as big-endian words).
  for (var i = 0u; i < 10u; i++) {
    w[i] = last[i];
  }
  for (var i = 10u; i < 16u; i++) {
    w[i] = 0u;
  }

  // p10 = 10^(dlen - 1): extracts decimal digits most significant first.
  var p10 = 1u;
  var v = nonce;
  while (v >= 10u) {
    v = v / 10u;
    p10 = p10 * 10u;
  }

  // Write the ASCII digits at byte offset 40 (words 10..).
  var rem = nonce;
  var j = 0u;
  while (p10 >= 1u) {
    let digit = rem / p10;
    rem = rem % p10;

    let widx = 10u + (j >> 2u);
    let shift = 24u - 8u * (j & 3u);
    let byte = 0x30u + digit;
    w[widx] = (w[widx] & ~(0xFFu << shift)) | (byte << shift);

    p10 = p10 / 10u;
    j = j + 1u;
  }

  // Message length in bytes = 40 + digit count.
  let off = 40u + j;

  // Padding: 0x80 after the message.
  let pad_widx = off >> 2u;
  let pad_shift = 24u - 8u * (off & 3u);
  w[pad_widx] = (w[pad_widx] & ~(0xFFu << pad_shift)) | (0x80u << pad_shift);

  // Message length in bits (big-endian, bytes 62..63).
  // Only the low 16 bits are needed here: off is always < 64.
  w[15] = ((off >> 5u) << 8u) | (off << 3u);

  // SHA-1 compression (single block, standard initial state).
  var h0 = 0x67452301u;
  var h1 = 0xEFCDAB89u;
  var h2 = 0x98BADCFEu;
  var h3 = 0x10325476u;
  var h4 = 0xC3D2E1F0u;

  var a = h0;
  var b = h1;
  var c = h2;
  var d = h3;
  var e = h4;

  for (var i = 0u; i < 80u; i++) {
    if (i >= 16u) {
      w[i & 15u] = rotl(w[(i - 3u) & 15u] ^ w[(i - 8u) & 15u] ^ w[(i - 14u) & 15u] ^ w[(i - 16u) & 15u], 1u);
    }

    var f: u32;
    var k: u32;
    if (i <= 19u) {
      f = (b & c) | ((~b) & d);
      k = 0x5A827999u;
    } else if (i <= 39u) {
      f = b ^ c ^ d;
      k = 0x6ED9EBA1u;
    } else if (i <= 59u) {
      f = (b & c) | (b & d) | (c & d);
      k = 0x8F1BBCDCu;
    } else {
      f = b ^ c ^ d;
      k = 0xCA62C1D6u;
    }

    let temp = rotl(a, 5u) + f + e + k + w[i & 15u];
    e = d;
    d = c;
    c = rotl(b, 30u);
    b = a;
    a = temp;
  }

  h0 = h0 + a;
  h1 = h1 + b;
  h2 = h2 + c;
  h3 = h3 + d;
  h4 = h4 + e;

  if (h0 == params.target0 &&
      h1 == params.target1 &&
      h2 == params.target2 &&
      h3 == params.target3 &&
      h4 == params.target4) {
    atomicMin(&result[0], nonce);
  }
}
