// Duino-Coin SHA-1 WebGPU occupancy candidate v6.
//
// Fixed 40-byte prefix is precomputed through SHA-1 round 9 on the CPU.
// The 60-byte fixed state/input is carried in a 64-byte uniform block,
// allowing the GPU to read it through the uniform/cache path instead of
// per-invocation storage loads. Nonce decimal encoding uses a 10k packed LUT.
// SHA-1 rounds 10..79 are fully unrolled.

struct Params {
  start_nonce: u32,
  num_nonces: u32,
  target0: u32,
  target1: u32,
  target2: u32,
  target3: u32,
  target4: u32,
};

struct Fixed {
  v0: vec4<u32>, // a,b,c,d after round 9
  v1: vec4<u32>, // e,W0,W1,W2
  v2: vec4<u32>, // W3..W6
  v3: vec4<u32>, // W7,W8,W9,unused
};

override NONCE_DIGITS: u32 = 10u;

@group(0) @binding(0) var<uniform> fixed: Fixed;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read_write> result: atomic<u32>;
@group(0) @binding(3) var<storage, read> digit_lut: array<vec2<u32>, 100000>;

fn rotl(x: u32, n: u32) -> u32 {
  return (x << n) | (x >> (32u - n));
}

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = gid.x;

  if (id >= params.num_nonces) { return; }
  let nonce = params.start_nonce + id;

  // 4 vector loads cover the complete invariant state/input.
  var a = fixed.v0.x;
  var b = fixed.v0.y;
  var c = fixed.v0.z;
  var d = fixed.v0.w;
  var e = fixed.v1.x;
  var w0 = fixed.v1.y;
  var w1 = fixed.v1.z;
  var w2 = fixed.v1.w;
  var w3 = fixed.v2.x;
  var w4 = fixed.v2.y;
  var w5 = fixed.v2.z;
  var w6 = fixed.v2.w;
  var w7 = fixed.v3.x;
  var w8 = fixed.v3.y;
  var w9 = fixed.v3.z;

  var w10 = 0u;
  var w11 = 0u;
  var w12 = 0u;
  var w13 = 0u;
  var w14 = 0u;
  var w15 = (40u + NONCE_DIGITS) << 3u;

  // The LUT stores exactly five ASCII digits as two words:
  //   .x = digits 0..3
  //   .y = digit 4 in the low byte
  //
  // For 6..10 digits, one division by 100000 produces the high
  // 1..5 digits; the low five digits are one LUT access.  This
  // replaces the multiple decimal divisions used previously.
  if (NONCE_DIGITS <= 5u) {
    let x = digit_lut[nonce];
    let a0 = (x.x >> 24u) & 0xFFu;
    let a1 = (x.x >> 16u) & 0xFFu;
    let a2 = (x.x >> 8u) & 0xFFu;
    let a3 = x.x & 0xFFu;
    let a4 = x.y & 0xFFu;

    if (NONCE_DIGITS == 5u) {
      w10 = x.x;
      w11 = (a4 << 24u) | 0x00800000u;
    } else if (NONCE_DIGITS == 4u) {
      w10 = (a1 << 24u) | (a2 << 16u) | (a3 << 8u) | a4;
      w11 = 0x80000000u;
    } else if (NONCE_DIGITS == 3u) {
      w10 = (a2 << 24u) | (a3 << 16u) | (a4 << 8u) | 0x80u;
    } else if (NONCE_DIGITS == 2u) {
      w10 = (a3 << 24u) | (a4 << 16u) | 0x00008000u;
    } else {
      w10 = (a4 << 24u) | 0x00800000u;
    }
  } else {
    // One constant division by 100000. The remainder is always 0..99999,
    // so both halves can use the same five-digit LUT.
    let q = nonce / 100000u;
    let r = nonce - q * 100000u;
    let hi = digit_lut[q];
    let lo = digit_lut[r];

    if (NONCE_DIGITS == 6u) {
      // q: 1 digit, r: 5 digits
      w10 = ((0x30u + q) << 24u) | (lo.x >> 8u);
      w11 = ((lo.x & 0x000000FFu) << 24u) |
            ((lo.y & 0xFFu) << 16u) |
            0x00008000u;
    } else if (NONCE_DIGITS == 7u) {
      // q: 2 digits, r: 5 digits
      let q0 = q / 10u;
      let q1 = q - q0 * 10u;
      w10 = ((0x30u + q0) << 24u) |
            ((0x30u + q1) << 16u) |
            ((lo.x & 0xFFFF0000u) >> 16u);
      w11 = ((lo.x & 0x0000FFFFu) << 16u) |
            ((lo.y & 0xFFu) << 8u) |
            0x80u;
    } else if (NONCE_DIGITS == 8u) {
      // q: 3 digits, r: 5 digits
      let q0 = q / 100u;
      let qr = q - q0 * 100u;
      let q1 = qr / 10u;
      let q2 = qr - q1 * 10u;
      w10 = ((0x30u + q0) << 24u) |
            ((0x30u + q1) << 16u) |
            ((0x30u + q2) << 8u) |
            ((lo.x >> 24u) & 0xFFu);
      w11 = ((lo.x & 0x00FFFFFFu) << 8u) |
            (lo.y & 0xFFu);
      w12 = 0x80000000u;
    } else if (NONCE_DIGITS == 9u) {
      // q: 4 digits, r: 5 digits
      w10 = ((hi.x & 0x00FFFFFFu) << 8u) | (hi.y & 0xFFu);
      w11 = lo.x;
      w12 = ((lo.y & 0xFFu) << 24u) | 0x00800000u;
    } else {
      // q: 5 digits, r: 5 digits
      let h4 = hi.y & 0xFFu;
      let l0 = (lo.x >> 24u) & 0xFFu;
      let l1 = (lo.x >> 16u) & 0xFFu;
      let l2 = (lo.x >> 8u) & 0xFFu;
      let l3 = lo.x & 0xFFu;
      let l4 = lo.y & 0xFFu;
      w10 = hi.x;
      w11 = (h4 << 24u) | (l0 << 16u) | (l1 << 8u) | l2;
      w12 = (l3 << 24u) | (l4 << 16u) | 0x00008000u;
    }
  }


  var w: array<u32, 16>;
  w[0]=w0; w[1]=w1; w[2]=w2; w[3]=w3; w[4]=w4; w[5]=w5; w[6]=w6; w[7]=w7;
  w[8]=w8; w[9]=w9; w[10]=w10; w[11]=w11; w[12]=w12; w[13]=w13; w[14]=w14; w[15]=w15;

  // Short region loops reduce register pressure versus 70 fully unrolled rounds.
  for (var i = 10u; i < 16u; i++) {
    let idx = i & 15u;
    let temp = rotl(a, 5u) + (d ^ (b & (c ^ d))) + e + 0x5A827999u + w[idx];
    e=d; d=c; c=rotl(b,30u); b=a; a=temp;
  }
  for (var i = 16u; i < 20u; i++) {
    let idx = i & 15u;
    w[idx] = rotl(w[(i - 3u) & 15u] ^ w[(i - 8u) & 15u] ^ w[(i - 14u) & 15u] ^ w[(i - 16u) & 15u], 1u);
    let temp = rotl(a, 5u) + (d ^ (b & (c ^ d))) + e + 0x5A827999u + w[idx];
    e=d; d=c; c=rotl(b,30u); b=a; a=temp;
  }
  for (var i = 20u; i < 40u; i++) {
    let idx = i & 15u;
    w[idx] = rotl(w[(i - 3u) & 15u] ^ w[(i - 8u) & 15u] ^ w[(i - 14u) & 15u] ^ w[(i - 16u) & 15u], 1u);
    let temp = rotl(a, 5u) + (b ^ c ^ d) + e + 0x6ED9EBA1u + w[idx];
    e=d; d=c; c=rotl(b,30u); b=a; a=temp;
  }
  for (var i = 40u; i < 60u; i++) {
    let idx = i & 15u;
    w[idx] = rotl(w[(i - 3u) & 15u] ^ w[(i - 8u) & 15u] ^ w[(i - 14u) & 15u] ^ w[(i - 16u) & 15u], 1u);
    let temp = rotl(a, 5u) + ((b & c) | (b & d) | (c & d)) + e + 0x8F1BBCDCu + w[idx];
    e=d; d=c; c=rotl(b,30u); b=a; a=temp;
  }
  for (var i = 60u; i < 80u; i++) {
    let idx = i & 15u;
    w[idx] = rotl(w[(i - 3u) & 15u] ^ w[(i - 8u) & 15u] ^ w[(i - 14u) & 15u] ^ w[(i - 16u) & 15u], 1u);
    let temp = rotl(a, 5u) + (b ^ c ^ d) + e + 0xCA62C1D6u + w[idx];
    e=d; d=c; c=rotl(b,30u); b=a; a=temp;
  }
  a += 0x67452301u; b += 0xEFCDAB89u; c += 0x98BADCFEu; d += 0x10325476u; e += 0xC3D2E1F0u;
  if (a == params.target0 && b == params.target1 && c == params.target2 && d == params.target3 && e == params.target4) {
    atomicMin(&result, params.start_nonce + id);
  }
}
