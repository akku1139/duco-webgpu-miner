// Duino-Coin SHA-1 compute shader (simple and correct)
//
// Each invocation searches one nonce.
// Uses simple digit encoding loop.

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
@group(0) @binding(2) var<storage, read_write> result: atomic<u32>;

fn rotl(x: u32, n: u32) -> u32 {
  return (x << n) | (x >> (32u - n));
}

// Simple nonce encoding: write decimal digits at offset 40
fn encode_nonce(w: ptr<function, array<u32, 16>>, nonce: u32) {
  // Count digits (simple loop)
  var digit_count = 1u;
  var temp = nonce;
  while (temp >= 10u) {
    temp = temp / 10u;
    digit_count = digit_count + 1u;
  }
  
  // Write digits from least significant to most significant, then reverse
  // Actually, let's write most significant first directly
  var n = nonce;
  var pow10 = 1u;
  var i = 0u;
  
  // Find the power of 10 for the most significant digit
  while (i < digit_count - 1u) {
    pow10 = pow10 * 10u;
    i = i + 1u;
  }
  
  // Write digits
  var j = 0u;
  while (j < digit_count) {
    let digit = n / pow10;
    n = n % pow10;
    
    let widx = 10u + (j >> 2u);
    let shift = 24u - 8u * (j & 3u);
    (*w)[widx] = ((*w)[widx] & ~(0xFFu << shift)) | ((0x30u + digit) << shift);
    
    pow10 = pow10 / 10u;
    j = j + 1u;
  }
  
  // Padding and length
  let msg_len = 40u + digit_count;
  let pad_widx = msg_len >> 2u;
  let pad_shift = 24u - 8u * (msg_len & 3u);
  (*w)[pad_widx] = ((*w)[pad_widx] & ~(0xFFu << pad_shift)) | (0x80u << pad_shift);
  (*w)[14] = 0u;
  (*w)[15] = msg_len << 3u;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let id = gid.x;
  if (id >= params.num_nonces) {
    return;
  }
  let nonce = params.start_nonce + id;

  // Build SHA-1 block
  var w: array<u32, 16>;
  
  // Load last hash (big-endian u32 words)
  for (var i = 0u; i < 10u; i++) {
    w[i] = last[i];
  }
  w[10] = 0u; w[11] = 0u; w[12] = 0u; w[13] = 0u;
  w[14] = 0u; w[15] = 0u;

  // Encode nonce
  encode_nonce(&w, nonce);

  // SHA-1 compression
  var h0 = 0x67452301u;
  var h1 = 0xEFCDAB89u;
  var h2 = 0x98BADCFEu;
  var h3 = 0x10325476u;
  var h4 = 0xC3D2E1F0u;

  var a = h0; var b = h1; var c = h2; var d = h3; var e = h4;

  for (var i = 0u; i < 80u; i++) {
    if (i >= 16u) {
      w[i & 15u] = rotl(w[(i - 3u) & 15u] ^ w[(i - 8u) & 15u] ^ w[(i - 14u) & 15u] ^ w[(i - 16u) & 15u], 1u);
    }
    var f: u32; var k: u32;
    if (i <= 19u) {
      f = (b & c) | ((~b) & d); k = 0x5A827999u;
    } else if (i <= 39u) {
      f = b ^ c ^ d; k = 0x6ED9EBA1u;
    } else if (i <= 59u) {
      f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDCu;
    } else {
      f = b ^ c ^ d; k = 0xCA62C1D6u;
    }
    let temp = rotl(a, 5u) + f + e + k + w[i & 15u];
    e = d; d = c; c = rotl(b, 30u); b = a; a = temp;
  }

  h0 += a; h1 += b; h2 += c; h3 += d; h4 += e;

  if (h0 == params.target0 && h1 == params.target1 && 
      h2 == params.target2 && h3 == params.target3 && h4 == params.target4) {
    atomicMin(&result, nonce);
  }
}
