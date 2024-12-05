// Constants
const SHA1_HASH_LEN: u32 = 20;
const BLOCK_SIZE: u32 = 64;
const NONCE_SIZE: u32 = 10; // Assuming nonce is 10 bytes

// Helper function to rotate bits (equivalent to sha1_rotl in C++)
fn sha1_rotl(bits: u32, word: u32) -> u32 {
  return (word << bits) | (word >> (32 - bits));
}

// Function to compute the hash of a block (same as the duco_hash_block function)
fn duco_hash_block(source: array<u8, 40>, nonce: array<u8, NONCE_SIZE>, out_hash: ptr<storage, array<u8, 20>>) {
  var w: array<u32, 16>;

  // Load the 16 32-bit words from the source and nonce into w[]
  var i: u32 = 0;
  var i4: u32 = 0;
  while (i < 10u) {
    w[i] = u32(source[i4]) << 24 |
         u32(source[i4 + 1u]) << 16 |
         u32(source[i4 + 2u]) << 8 |
         u32(source[i4 + 3u]);
    i = i + 1;
    i4 = i4 + 4u;
  }

  // Add the nonce to the message
  i = 0u;
  while (i < NONCE_SIZE) {
    w[i + 10u] = u32(nonce[i]) << 24;
    i = i + 1;
  }

  // Temporary state for SHA1
  var a: u32 = 0x67452301;
  var b: u32 = 0xefcdab89;
  var c: u32 = 0x98badcfe;
  var d: u32 = 0x10325476;
  var e: u32 = 0xc3d2e1f0;

  // Process the block in the same way as the SHA1 algorithm
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

  // Finalize the state
  a = a + 0x67452301u;
  b = b + 0xefcdab89u;
  c = c + 0x98badcfeu;
  d = d + 0x10325476u;
  e = e + 0xc3d2e1f0u;

  // Store the result in out_hash
  out_hash[0u] = u8(a >> 24);
  out_hash[1u] = u8(a >> 16);
  out_hash[2u] = u8(a >> 8);
  out_hash[3u] = u8(a);
  out_hash[4u] = u8(b >> 24);
  out_hash[5u] = u8(b >> 16);
  out_hash[6u] = u8(b >> 8);
  out_hash[7u] = u8(b);
  out_hash[8u] = u8(c >> 24);
  out_hash[9u] = u8(c >> 16);
  out_hash[10u] = u8(c >> 8);
  out_hash[11u] = u8(c);
  out_hash[12u] = u8(d >> 24);
  out_hash[13u] = u8(d >> 16);
  out_hash[14u] = u8(d >> 8);
  out_hash[15u] = u8(d);
  out_hash[16u] = u8(e >> 24);
  out_hash[17u] = u8(e >> 16);
  out_hash[18u] = u8(e >> 8);
  out_hash[19u] = u8(e);
}

// Main entry point that checks nonces for a matching hash
@compute  @workgroup_size(1) fn main(@group(0) @binding(0) source: array<u8, 40>,
          @group(0) @binding(1) target: array<u8, 20>,
          @group(0) @binding(2) max_nonce: u32,
          @group(0) @binding(3) out_nonce: ptr<storage, u32>) {
  var nonce: array<u8, NONCE_SIZE>;
  var hash_result: array<u8, 20>;

  // Loop over the nonce range
  var i: u32 = 0u;
  while (i < max_nonce) {
    // Set the current nonce (in a real scenario, you'd need to increment it)
    // For simplicity, let's assume nonce is incremented sequentially
    var j: u32 = 0u;
    while (j < NONCE_SIZE) {
      nonce[j] = u8(i >> (j * 8u));
      j = j + 1;
    }

    // Compute the hash for the current nonce
    duco_hash_block(source, nonce, &hash_result);

    // Compare the hash with the target
    var match: bool = true;
    j = 0u;
    while (j < 20u) {
      if (hash_result[j] != target[j]) {
        match = false;
        break;
      }
      j = j + 1;
    }

    // If the hash matches, return the nonce
    if (match) {
      *out_nonce = i;
      return; // Exit early since we found a match
    }

    i = i + 1;
  }
}
