// Duino-Coin SHA-1 WebGPU fast path.
// Fixed 40-byte prefix is precomputed through SHA-1 round 9 on the CPU.
// Nonce bytes/padding are generated on-GPU from a small decimal lookup table.
// One invocation handles one nonce. This preserves the original exact-match
// target semantics while keeping the host out of the per-nonce hot path.
//
// fixed[0..4]  = state after rounds 0..9 for last[0..39]
// fixed[5..14] = big-endian W[0..9] for the fixed last hash string
// digit_lut[x] = ASCII "xxxx" packed big-endian for 0..9999.

struct Params {
  start_nonce: u32,
  num_nonces: u32,
  target0: u32,
  target1: u32,
  target2: u32,
  target3: u32,
  target4: u32,
};

override NONCE_DIGITS: u32 = 10u;

@group(0) @binding(0) var<storage, read> fixed: array<u32, 15>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read_write> result: atomic<u32>;
@group(0) @binding(3) var<storage, read> digit_lut: array<u32, 10000>;

var<workgroup> shared_fixed: array<u32, 15>;

fn rotl(x: u32, n: u32) -> u32 {
  return (x << n) | (x >> (32u - n));
}

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) local_id: vec3<u32>,
) {
  let id = gid.x;
  let lid = local_id.x;

  // Load the invariant 60-byte prefix/state once per workgroup instead of
  // making every invocation fetch it repeatedly from storage memory.
  if (lid < 15u) {
    shared_fixed[lid] = fixed[lid];
  }
  workgroupBarrier();

  if (id >= params.num_nonces) { return; }
  let nonce = params.start_nonce + id;

  var w0 = shared_fixed[5]; var w1 = shared_fixed[6]; var w2 = shared_fixed[7]; var w3 = shared_fixed[8];
  var w4 = shared_fixed[9]; var w5 = shared_fixed[10]; var w6 = shared_fixed[11]; var w7 = shared_fixed[12];
  var w8 = shared_fixed[13]; var w9 = shared_fixed[14];

  // NONCE_DIGITS is a pipeline override, so the compiler can fold this to
  // a single encoding path for each decimal width.
  var w10 = 0u; var w11 = 0u; var w12 = 0u; var w13 = 0u; var w14 = 0u;
  var w15 = (40u + NONCE_DIGITS) << 3u;

  if (NONCE_DIGITS == 1u) {
    let x = digit_lut[nonce];
    w10 = ((x & 0x000000FFu) << 24u) | 0x00800000u;
  } else if (NONCE_DIGITS == 2u) {
    let x = digit_lut[nonce];
    w10 = ((x & 0x0000FFFFu) << 16u) | 0x00008000u;
  } else if (NONCE_DIGITS == 3u) {
    let x = digit_lut[nonce];
    w10 = ((x & 0x00FFFFFFu) << 8u) | 0x00000080u;
  } else if (NONCE_DIGITS == 4u) {
    w10 = digit_lut[nonce];
    w11 = 0x80000000u;
  } else if (NONCE_DIGITS == 5u) {
    let q = nonce / 10u; let r = nonce - q * 10u;
    w10 = digit_lut[q];
    w11 = ((0x30u + r) << 24u) | 0x00800000u;
  } else if (NONCE_DIGITS == 6u) {
    let q = nonce / 100u; let r = nonce - q * 100u;
    w10 = digit_lut[q];
    w11 = ((digit_lut[r] & 0x0000FFFFu) << 16u) | 0x00008000u;
  } else if (NONCE_DIGITS == 7u) {
    let q = nonce / 1000u; let r = nonce - q * 1000u;
    w10 = digit_lut[q];
    w11 = ((digit_lut[r] & 0x00FFFFFFu) << 8u) | 0x00000080u;
  } else if (NONCE_DIGITS == 8u) {
    let q = nonce / 10000u; let r = nonce - q * 10000u;
    w10 = digit_lut[q];
    w11 = digit_lut[r];
    w12 = 0x80000000u;
  } else if (NONCE_DIGITS == 9u) {
    let q = nonce / 100000u; let r = nonce - q * 100000u;
    let q2 = r / 10u; let r2 = r - q2 * 10u;
    w10 = digit_lut[q];
    w11 = digit_lut[q2];
    w12 = ((0x30u + r2) << 24u) | 0x00800000u;
  } else {
    let q = nonce / 1000000u; let r = nonce - q * 1000000u;
    let q2 = r / 100u; let r2 = r - q2 * 100u;
    w10 = digit_lut[q];
    w11 = digit_lut[q2];
    w12 = ((digit_lut[r2] & 0x0000FFFFu) << 16u) | 0x00008000u;
  }

  var a = shared_fixed[0]; var b = shared_fixed[1]; var c = shared_fixed[2];
  var d = fixed[3]; var e = fixed[4];

  {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w10;e=d;d=c;c=rotl(b,30u);b=a;a=q;} {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w11;e=d;d=c;c=rotl(b,30u);b=a;a=q;} {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w12;e=d;d=c;c=rotl(b,30u);b=a;a=q;} {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w13;e=d;d=c;c=rotl(b,30u);b=a;a=q;} {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w14;e=d;d=c;c=rotl(b,30u);b=a;a=q;} {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w15;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w0=rotl(w13^w8^w2^w0,1u); {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w0;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w1=rotl(w14^w9^w3^w1,1u); {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w1;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w2=rotl(w15^w10^w4^w2,1u); {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w2;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w3=rotl(w0^w11^w5^w3,1u); {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w3;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w4=rotl(w1^w12^w6^w4,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w4;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w5=rotl(w2^w13^w7^w5,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w5;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w6=rotl(w3^w14^w8^w6,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w6;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w7=rotl(w4^w15^w9^w7,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w7;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w8=rotl(w5^w0^w10^w8,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w8;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w9=rotl(w6^w1^w11^w9,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w9;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w10=rotl(w7^w2^w12^w10,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w10;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w11=rotl(w8^w3^w13^w11,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w11;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w12=rotl(w9^w4^w14^w12,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w12;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w13=rotl(w10^w5^w15^w13,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w13;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w14=rotl(w11^w6^w0^w14,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w14;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w15=rotl(w12^w7^w1^w15,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w15;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w0=rotl(w13^w8^w2^w0,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w0;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w1=rotl(w14^w9^w3^w1,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w1;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w2=rotl(w15^w10^w4^w2,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w2;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w3=rotl(w0^w11^w5^w3,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w3;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w4=rotl(w1^w12^w6^w4,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w4;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w5=rotl(w2^w13^w7^w5,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w5;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w6=rotl(w3^w14^w8^w6,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w6;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w7=rotl(w4^w15^w9^w7,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w7;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w8=rotl(w5^w0^w10^w8,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w8;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w9=rotl(w6^w1^w11^w9,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w9;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w10=rotl(w7^w2^w12^w10,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w10;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w11=rotl(w8^w3^w13^w11,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w11;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w12=rotl(w9^w4^w14^w12,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w12;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w13=rotl(w10^w5^w15^w13,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w13;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w14=rotl(w11^w6^w0^w14,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w14;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w15=rotl(w12^w7^w1^w15,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w15;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w0=rotl(w13^w8^w2^w0,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w0;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w1=rotl(w14^w9^w3^w1,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w1;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w2=rotl(w15^w10^w4^w2,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w2;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w3=rotl(w0^w11^w5^w3,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w3;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w4=rotl(w1^w12^w6^w4,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w4;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w5=rotl(w2^w13^w7^w5,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w5;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w6=rotl(w3^w14^w8^w6,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w6;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w7=rotl(w4^w15^w9^w7,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w7;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w8=rotl(w5^w0^w10^w8,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w8;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w9=rotl(w6^w1^w11^w9,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w9;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w10=rotl(w7^w2^w12^w10,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w10;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w11=rotl(w8^w3^w13^w11,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w11;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w12=rotl(w9^w4^w14^w12,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w12;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w13=rotl(w10^w5^w15^w13,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w13;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w14=rotl(w11^w6^w0^w14,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w14;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w15=rotl(w12^w7^w1^w15,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w15;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w0=rotl(w13^w8^w2^w0,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w0;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w1=rotl(w14^w9^w3^w1,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w1;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w2=rotl(w15^w10^w4^w2,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w2;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w3=rotl(w0^w11^w5^w3,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w3;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w4=rotl(w1^w12^w6^w4,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w4;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w5=rotl(w2^w13^w7^w5,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w5;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w6=rotl(w3^w14^w8^w6,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w6;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w7=rotl(w4^w15^w9^w7,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w7;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w8=rotl(w5^w0^w10^w8,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w8;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w9=rotl(w6^w1^w11^w9,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w9;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w10=rotl(w7^w2^w12^w10,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w10;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w11=rotl(w8^w3^w13^w11,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w11;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w12=rotl(w9^w4^w14^w12,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w12;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w13=rotl(w10^w5^w15^w13,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w13;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w14=rotl(w11^w6^w0^w14,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w14;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w15=rotl(w12^w7^w1^w15,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w15;e=d;d=c;c=rotl(b,30u);b=a;a=q;}

  a += 0x67452301u; b += 0xEFCDAB89u; c += 0x98BADCFEu;
  d += 0x10325476u; e += 0xC3D2E1F0u;

  if (a == params.target0 && b == params.target1 && c == params.target2 &&
      d == params.target3 && e == params.target4) {
    atomicMin(&result, params.start_nonce + id);
  }
}
