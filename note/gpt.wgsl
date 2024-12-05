// Constants
const SHA1_HASH_LEN: u32 = 20;
const BLOCK_SIZE: u32 = 64;

// Helper function to rotate bits (equivalent to sha1_rotl in C++)
fn sha1_rotl(bits: u32, word: u32) -> u32 {
  return (word << bits) | (word >> (32 - bits));
}

@group(0) @binding(0) var<storage, read_write> hasher: array<u8>; // The hash state data

// The main hash function that processes a single block
fn duco_hash_block() {
  var w: array<u32, 16>;

  // Loading 16 32-bit words from the buffer (equivalent to the C++ `w[i]` loop)
  var i: u32 = 0;
  var i4: u32 = 0;
  while (i < 16) {
    w[i] = u32(hasher[i4]) << 24 |
           u32(hasher[i4 + 1]) << 16 |
           u32(hasher[i4 + 2]) << 8 |
           u32(hasher[i4 + 3]);
    i = i + 1;
    i4 = i4 + 4;
  }

  // Temporary state (equivalent to `a, b, c, d, e` in C++)
  var a: u32 = 0x67452301;
  var b: u32 = 0xefcdab89;
  var c: u32 = 0x98badcfe;
  var d: u32 = 0x10325476;
  var e: u32 = 0xc3d2e1f0;

  // Main SHA1 loop
  for (i = 10u; i < 80u; i = i + 1) {
    if (i >= 16u) {
      w[i % 16u] = sha1_rotl(1u, w[(i - 3u) % 16u] ^ w[(i - 8u) % 16u] ^ w[(i - 14u) % 16u] ^ w[(i - 16u) % 16u]);
    }

    var temp: u32 = sha1_rotl(5u, a) + e + w[i % 16u];

    if (i < 20u) {
      temp = temp + (b & c) | ((~b) & d);
      temp = temp + 0x5a827999u;
    } else if (i < 40u) {
      temp = temp + (b ^ c ^ d);
      temp = temp + 0x6ed9eba1u;
    } else if (i < 60u) {
      temp = temp + (b & c) | (b & d) | (c & d);
      temp = temp + 0x8f1bbcdcu;
    } else {
      temp = temp + (b ^ c ^ d);
      temp = temp + 0xca62c1d6u;
    }

    e = d;
    d = c;
    c = sha1_rotl(30u, b);
    b = a;
    a = temp;
  }

  // Finalize the state (adding constants to the result)
  a = a + 0x67452301u;
  b = b + 0xefcdab89u;
  c = c + 0x98badcfeu;
  d = d + 0x10325476u;
  e = e + 0xc3d2e1f0u;

  // Storing the result in the hasher (equivalent to C++ result assignments)
  hasher[0u] = u8(a >> 24);
  hasher[1u] = u8(a >> 16);
  hasher[2u] = u8(a >> 8);
  hasher[3u] = u8(a);
  hasher[4u] = u8(b >> 24);
  hasher[5u] = u8(b >> 16);
  hasher[6u] = u8(b >> 8);
  hasher[7u] = u8(b);
  hasher[8u] = u8(c >> 24);
  hasher[9u] = u8(c >> 16);
  hasher[10u] = u8(c >> 8);
  hasher[11u] = u8(c);
  hasher[12u] = u8(d >> 24);
  hasher[13u] = u8(d >> 16);
  hasher[14u] = u8(d >> 8);
  hasher[15u] = u8(d);
  hasher[16u] = u8(e >> 24);
  hasher[17u] = u8(e >> 16);
  hasher[18u] = u8(e >> 8);
  hasher[19u] = u8(e);
}

// Initialize the hasher with the previous hash (this function is slightly adjusted for WGSL)
fn duco_hash_init(prev_hash: array<u8, 40>) {
  var i: u32 = 0;
  while (i < 40u) {
    hasher[i] = prev_hash[i];
    i = i + 1;
  }

  var a: u32 = 0x67452301;
  var b: u32 = 0xefcdab89;
  var c: u32 = 0x98badcfe;
  var d: u32 = 0x10325476;
  var e: u32 = 0xc3d2e1f0;

  var w: array<u32, 10>;
  var i4: u32 = 0;
  i = 0u;
  while (i < 10u) {
    w[i] = u32(prev_hash[i4]) << 24 |
           u32(prev_hash[i4 + 1u]) << 16 |
           u32(prev_hash[i4 + 2u]) << 8 |
           u32(prev_hash[i4 + 3u]);
    i = i + 1;
    i4 = i4 + 4u;
  }

  for (i = 0u; i < 10u; i = i + 1) {
    var temp: u32 = sha1_rotl(5u, a) + e + w[i % 16u];
    temp = temp + (b & c) | ((~b) & d);
    temp = temp + 0x5a827999u;

    e = d;
    d = c;
    c = sha1_rotl(30u, b);
    b = a;
    a = temp;
  }

  // Save the temporary state
  hasher[20u] = u8(a >> 24);
  hasher[21u] = u8(a >> 16);
  hasher[22u] = u8(a >> 8);
  hasher[23u] = u8(a);
  hasher[24u] = u8(b >> 24);
  hasher[25u] = u8(b >> 16);
  hasher[26u] = u8(b >> 8);
  hasher[27u] = u8(b);
  hasher[28u] = u8(c >> 24);
  hasher[29u] = u8(c >> 16);
  hasher[30u] = u8(c >> 8);
  hasher[31u] = u8(c);
  hasher[32u] = u8(d >> 24);
  hasher[33u] = u8(d >> 16);
  hasher[34u] = u8(d >> 8);
  hasher[35u] = u8(d);
  hasher[36u] = u8(e >> 24);
  hasher[37u] = u8(e >> 16);
  hasher[38u] = u8(e >> 8);
  hasher[39u] = u8(e);
}

fn duco_hash_set_nonce(nonce: array<u8, 10>) {
  var off: u32 = 20u * 2u; // offset for the nonce
  var i: u32 = 0u;

  while (i < 10u && nonce[i] != 0u) {
    hasher[off] = nonce[i];
    off = off + 1u;
    i = i + 1;
  }

  // Padding the buffer
  hasher[off] = 0x80u;
  off = off + 1u;

  while (off < 62u) {
    hasher[off] = 0u;
    off = off + 1u;
  }

  hasher[62u] = u8(off >> 5u);   // Total length of the data in bits (upper byte)
  hasher[63u] = u8(off << 3u);   // Total length of the data in bits (lower byte)
}

fn duco_hash_try_nonce(nonce: array<u8, 10>) -> array<u8, 20> {
  duco_hash_set_nonce(nonce);
  duco_hash_block();

  // Return the result of the hash calculation
  var result: array<u8, 20>;
  result[0] = hasher[0u];
  result[1] = hasher[1u];
  result[2] = hasher[2u];
  result[3] = hasher[3u];
  result[4] = hasher[4u];
  result[5] = hasher[5u];
  result[6] = hasher[6u];
  result[7] = hasher[7u];
  result[8] = hasher[8u];
  result[9] = hasher[9u];
  result[10] = hasher[10u];
  result[11] = hasher[11u];
  result[12] = hasher[12u];
  result[13] = hasher[13u];
  result[14] = hasher[14u];
  result[15] = hasher[15u];
  result[16] = hasher[16u];
  result[17] = hasher[17u];
  result[18] = hasher[18u];
  result[19] = hasher[19u];
  return result;
}
