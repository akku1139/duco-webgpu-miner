// Duino-Coin SHA-1 WebGPU fast path v4.
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

@compute @workgroup_size(256)
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
    let q = nonce / 100000u;
    let r = nonce - q * 100000u;
    let hi = digit_lut[q];
    let lo = digit_lut[r];

    let h0 = (hi.x >> 24u) & 0xFFu;
    let h1 = (hi.x >> 16u) & 0xFFu;
    let h2 = (hi.x >> 8u) & 0xFFu;
    let h3 = hi.x & 0xFFu;
    let h4 = hi.y & 0xFFu;
    let l0 = (lo.x >> 24u) & 0xFFu;
    let l1 = (lo.x >> 16u) & 0xFFu;
    let l2 = (lo.x >> 8u) & 0xFFu;
    let l3 = lo.x & 0xFFu;
    let l4 = lo.y & 0xFFu;

    if (NONCE_DIGITS == 6u) {
      w10 = (h4 << 24u) | (l0 << 16u) | (l1 << 8u) | l2;
      w11 = (l3 << 24u) | (l4 << 16u) | 0x00008000u;
    } else if (NONCE_DIGITS == 7u) {
      w10 = (h3 << 24u) | (h4 << 16u) | (l0 << 8u) | l1;
      w11 = (l2 << 24u) | (l3 << 16u) | (l4 << 8u) | 0x80u;
    } else if (NONCE_DIGITS == 8u) {
      w10 = (h2 << 24u) | (h3 << 16u) | (h4 << 8u) | l0;
      w11 = (l1 << 24u) | (l2 << 16u) | (l3 << 8u) | l4;
      w12 = 0x80000000u;
    } else if (NONCE_DIGITS == 9u) {
      w10 = (h1 << 24u) | (h2 << 16u) | (h3 << 8u) | h4;
      w11 = lo.x;
      w12 = (l4 << 24u) | 0x00800000u;
    } else {
      w10 = (h0 << 24u) | (h1 << 16u) | (h2 << 8u) | h3;
      w11 = (h4 << 24u) | (l0 << 16u) | (l1 << 8u) | l2;
      w12 = (l3 << 24u) | (l4 << 16u) | 0x00008000u;
    }
  }


  {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w10;e=d;d=c;c=rotl(b,30u);b=a;a=q;} {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w11;e=d;d=c;c=rotl(b,30u);b=a;a=q;} {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w12;e=d;d=c;c=rotl(b,30u);b=a;a=q;} {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w13;e=d;d=c;c=rotl(b,30u);b=a;a=q;} {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w14;e=d;d=c;c=rotl(b,30u);b=a;a=q;} {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w15;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w0=rotl(w13^w8^w2^w0,1u); {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w0;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w1=rotl(w14^w9^w3^w1,1u); {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w1;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w2=rotl(w15^w10^w4^w2,1u); {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w2;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w3=rotl(w0^w11^w5^w3,1u); {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w3;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w4=rotl(w1^w12^w6^w4,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w4;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w5=rotl(w2^w13^w7^w5,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w5;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w6=rotl(w3^w14^w8^w6,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w6;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w7=rotl(w4^w15^w9^w7,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w7;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w8=rotl(w5^w0^w10^w8,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w8;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w9=rotl(w6^w1^w11^w9,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w9;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w10=rotl(w7^w2^w12^w10,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w10;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w11=rotl(w8^w3^w13^w11,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w11;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w12=rotl(w9^w4^w14^w12,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w12;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w13=rotl(w10^w5^w15^w13,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w13;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w14=rotl(w11^w6^w0^w14,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w14;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w15=rotl(w12^w7^w1^w15,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w15;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w0=rotl(w13^w8^w2^w0,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w0;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w1=rotl(w14^w9^w3^w1,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w1;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w2=rotl(w15^w10^w4^w2,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w2;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w3=rotl(w0^w11^w5^w3,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w3;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w4=rotl(w1^w12^w6^w4,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w4;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w5=rotl(w2^w13^w7^w5,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w5;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w6=rotl(w3^w14^w8^w6,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w6;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w7=rotl(w4^w15^w9^w7,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w7;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w8=rotl(w5^w0^w10^w8,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w8;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w9=rotl(w6^w1^w11^w9,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w9;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w10=rotl(w7^w2^w12^w10,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w10;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w11=rotl(w8^w3^w13^w11,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w11;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w12=rotl(w9^w4^w14^w12,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w12;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w13=rotl(w10^w5^w15^w13,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w13;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w14=rotl(w11^w6^w0^w14,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w14;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w15=rotl(w12^w7^w1^w15,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w15;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w0=rotl(w13^w8^w2^w0,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w0;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w1=rotl(w14^w9^w3^w1,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w1;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w2=rotl(w15^w10^w4^w2,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w2;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w3=rotl(w0^w11^w5^w3,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w3;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w4=rotl(w1^w12^w6^w4,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w4;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w5=rotl(w2^w13^w7^w5,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w5;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w6=rotl(w3^w14^w8^w6,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w6;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w7=rotl(w4^w15^w9^w7,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w7;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w8=rotl(w5^w0^w10^w8,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w8;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w9=rotl(w6^w1^w11^w9,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w9;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w10=rotl(w7^w2^w12^w10,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w10;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w11=rotl(w8^w3^w13^w11,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w11;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w12=rotl(w9^w4^w14^w12,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w12;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w13=rotl(w10^w5^w15^w13,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w13;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w14=rotl(w11^w6^w0^w14,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w14;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w15=rotl(w12^w7^w1^w15,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w15;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w0=rotl(w13^w8^w2^w0,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w0;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w1=rotl(w14^w9^w3^w1,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w1;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w2=rotl(w15^w10^w4^w2,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w2;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w3=rotl(w0^w11^w5^w3,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w3;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w4=rotl(w1^w12^w6^w4,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w4;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w5=rotl(w2^w13^w7^w5,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w5;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w6=rotl(w3^w14^w8^w6,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w6;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w7=rotl(w4^w15^w9^w7,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w7;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w8=rotl(w5^w0^w10^w8,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w8;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w9=rotl(w6^w1^w11^w9,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w9;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w10=rotl(w7^w2^w12^w10,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w10;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w11=rotl(w8^w3^w13^w11,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w11;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w12=rotl(w9^w4^w14^w12,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w12;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w13=rotl(w10^w5^w15^w13,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w13;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w14=rotl(w11^w6^w0^w14,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w14;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w15=rotl(w12^w7^w1^w15,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w15;e=d;d=c;c=rotl(b,30u);b=a;a=q;}

  a += 0x67452301u; b += 0xEFCDAB89u; c += 0x98BADCFEu;
  d += 0x10325476u; e += 0xC3D2E1F0u;

  if (a == params.target0 && b == params.target1 && c == params.target2 &&
      d == params.target3 && e == params.target4) {
    atomicMin(&result, params.start_nonce + id);
  }
}
