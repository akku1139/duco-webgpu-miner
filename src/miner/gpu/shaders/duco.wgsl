// Duino-Coin SHA-1 WebGPU fast path.
// Fixed 40-byte prefix is precomputed through SHA-1 round 9 on the CPU.
// Nonce bytes/padding are pre-encoded by the host into nonce_words.
// One invocation handles one nonce. This preserves the original exact-match
// target semantics while removing nonce decimal division/modulo and dynamic
// SHA-1 round/W-schedule indexing from the shader.
//
// fixed[0..4]  = state after rounds 0..9 for last[0..39]
// fixed[5..14] = big-endian W[0..9] for the fixed last hash string
// nonce_words = 4 u32 per nonce: W10,W11,W12,message-bit-length in W15.

struct Params {
  start_nonce: u32,
  num_nonces: u32,
  target0: u32,
  target1: u32,
  target2: u32,
  target3: u32,
  target4: u32,
};

@group(0) @binding(0) var<storage, read> fixed: array<u32, 15>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read_write> result: atomic<u32>;
@group(0) @binding(3) var<storage, read> nonce_words: array<u32>;

fn rotl(x: u32, n: u32) -> u32 {
  return (x << n) | (x >> (32u - n));
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = gid.x;
  if (id >= params.num_nonces) { return; }
  let p = id * 4u;

  var w0 = fixed[5]; var w1 = fixed[6]; var w2 = fixed[7]; var w3 = fixed[8];
  var w4 = fixed[9]; var w5 = fixed[10]; var w6 = fixed[11]; var w7 = fixed[12];
  var w8 = fixed[13]; var w9 = fixed[14];
  var w10 = nonce_words[p]; var w11 = nonce_words[p + 1u];
  var w12 = nonce_words[p + 2u]; var w13 = 0u;
  var w14 = 0u; var w15 = nonce_words[p + 3u];

  var a = fixed[0]; var b = fixed[1]; var c = fixed[2];
  var d = fixed[3]; var e = fixed[4];

  {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w10;e=d;d=c;c=rotl(b,30u);b=a;a=q;} {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w11;e=d;d=c;c=rotl(b,30u);b=a;a=q;} {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w12;e=d;d=c;c=rotl(b,30u);b=a;a=q;} {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w13;e=d;d=c;c=rotl(b,30u);b=a;a=q;} {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w14;e=d;d=c;c=rotl(b,30u);b=a;a=q;} {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w15;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w0=rotl(w13^w8^w2^w0,1u); {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w0;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w1=rotl(w14^w9^w3^w1,1u); {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w1;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w2=rotl(w15^w10^w4^w2,1u); {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w2;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w3=rotl(w0^w11^w5^w3,1u); {let q=rotl(a,5u)+(d^(b&(c^d)))+e+0x5A827999u+w3;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w4=rotl(w1^w12^w6^w4,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w4;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w5=rotl(w2^w13^w7^w5,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w5;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w6=rotl(w3^w14^w8^w6,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w6;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w7=rotl(w4^w15^w9^w7,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w7;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w8=rotl(w5^w0^w10^w8,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w8;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w9=rotl(w6^w1^w11^w9,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w9;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w10=rotl(w7^w2^w12^w10,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w10;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w11=rotl(w8^w3^w13^w11,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w11;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w12=rotl(w9^w4^w14^w12,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w12;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w13=rotl(w10^w5^w15^w13,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w13;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w14=rotl(w11^w6^w0^w14,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w14;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w15=rotl(w12^w7^w1^w15,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w15;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w0=rotl(w13^w8^w2^w0,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w0;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w1=rotl(w14^w9^w3^w1,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w1;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w2=rotl(w15^w10^w4^w2,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w2;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w3=rotl(w0^w11^w5^w3,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w3;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w4=rotl(w1^w12^w6^w4,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w4;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w5=rotl(w2^w13^w7^w5,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w5;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w6=rotl(w3^w14^w8^w6,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w6;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w7=rotl(w4^w15^w9^w7,1u); {let q=rotl(a,5u)+(b^c^d)+e+0x6ED9EBA1u+w7;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w8=rotl(w5^w0^w10^w8,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w8;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w9=rotl(w6^w1^w11^w9,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w9;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w10=rotl(w7^w2^w12^w10,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w10;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w11=rotl(w8^w3^w13^w11,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w11;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w12=rotl(w9^w4^w14^w12,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w12;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w13=rotl(w10^w5^w15^w13,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w13;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w14=rotl(w11^w6^w0^w14,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w14;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w15=rotl(w12^w7^w1^w15,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w15;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w0=rotl(w13^w8^w2^w0,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w0;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w1=rotl(w14^w9^w3^w1,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w1;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w2=rotl(w15^w10^w4^w2,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w2;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w3=rotl(w0^w11^w5^w3,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w3;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w4=rotl(w1^w12^w6^w4,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w4;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w5=rotl(w2^w13^w7^w5,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w5;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w6=rotl(w3^w14^w8^w6,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w6;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w7=rotl(w4^w15^w9^w7,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w7;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w8=rotl(w5^w0^w10^w8,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w8;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w9=rotl(w6^w1^w11^w9,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w9;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w10=rotl(w7^w2^w12^w10,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w10;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w11=rotl(w8^w3^w13^w11,1u); {let q=rotl(a,5u)+((b&c)|(b&d)|(c&d))+e+0x8F1BBCDCu+w11;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w12=rotl(w9^w4^w14^w12,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w12;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w13=rotl(w10^w5^w15^w13,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w13;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w14=rotl(w11^w6^w0^w14,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w14;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w15=rotl(w12^w7^w1^w15,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w15;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w0=rotl(w13^w8^w2^w0,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w0;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w1=rotl(w14^w9^w3^w1,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w1;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w2=rotl(w15^w10^w4^w2,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w2;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w3=rotl(w0^w11^w5^w3,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w3;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w4=rotl(w1^w12^w6^w4,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w4;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w5=rotl(w2^w13^w7^w5,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w5;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w6=rotl(w3^w14^w8^w6,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w6;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w7=rotl(w4^w15^w9^w7,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w7;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w8=rotl(w5^w0^w10^w8,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w8;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w9=rotl(w6^w1^w11^w9,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w9;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w10=rotl(w7^w2^w12^w10,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w10;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w11=rotl(w8^w3^w13^w11,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w11;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w12=rotl(w9^w4^w14^w12,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w12;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w13=rotl(w10^w5^w15^w13,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w13;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w14=rotl(w11^w6^w0^w14,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w14;e=d;d=c;c=rotl(b,30u);b=a;a=q;} w15=rotl(w12^w7^w1^w15,1u); {let q=rotl(a,5u)+(b^c^d)+e+0xCA62C1D6u+w15;e=d;d=c;c=rotl(b,30u);b=a;a=q;}

  a += 0x67452301u; b += 0xEFCDAB89u; c += 0x98BADCFEu;
  d += 0x10325476u; e += 0xC3D2E1F0u;

  if (a == params.target0 && b == params.target1 && c == params.target2 &&
      d == params.target3 && e == params.target4) {
    atomicMin(&result, params.start_nonce + id);
  }
}
