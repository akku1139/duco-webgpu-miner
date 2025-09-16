// WGSL SHA-1 Compute Shader
// This shader correctly computes the SHA-1 hash for a given data block.
// Each workgroup processes a single 512-bit (64-byte) block of the message.
// gy Gemini 2.5 Flash

// Circular left shift function
fn rotl(x: u32, n: u32) -> u32 {
    return (x << n) | (x >> (32 - n));
}

// Input: a buffer containing the padded message.
// Output: a buffer to store the final hash state.
@group(0) @binding(0) var<storage, read> input: array<u32>;
@group(0) @binding(1) var<storage, read_write> output: array<u32>;

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let block_index = global_id.x;
    let offset = block_index * 16u;

    // Message schedule array
    var w: array<u32, 80>;
    for (var i = 0u; i < 16u; i++) {
        w[i] = input[offset + i];
    }
    for (var i = 16u; i < 80u; i++) {
        w[i] = rotl(w[i - 3u] ^ w[i - 8u] ^ w[i - 14u] ^ w[i - 16u], 1u);
    }

    // Initialize working variables with the current hash state.
    // For the first block, these are the standard initial hash values.
    // For subsequent blocks, they are the hash values from the previous block.
    var h0 = 0x67452301u;
    var h1 = 0xEFCDAB89u;
    var h2 = 0x98BADCFEu;
    var h3 = 0x10325476u;
    var h4 = 0xC3D2E1F0u;

    // The output buffer is used to store the running hash state across blocks.
    // We read the previous state from the output buffer.
    // Note: This simple approach requires a sequential dispatch of workgroups,
    // or a more complex atomic operation for parallel processing.
    if (block_index > 0) {
        h0 = output[0];
        h1 = output[1];
        h2 = output[2];
        h3 = output[3];
        h4 = output[4];
    }

    var a = h0;
    var b = h1;
    var c = h2;
    var d = h3;
    var e = h4;
    var temp: u32;

    // Main loop
    for (var i = 0u; i < 80u; i++) {
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
        } else { // i <= 79u
            f = b ^ c ^ d;
            k = 0xCA62C1D6u;
        }

        temp = rotl(a, 5u) + f + e + k + w[i];
        e = d;
        d = c;
        c = rotl(b, 30u);
        b = a;
        a = temp;
    }

    // Add this chunk's hash to the running hash state
    h0 = h0 + a;
    h1 = h1 + b;
    h2 = h2 + c;
    h3 = h3 + d;
    h4 = h4 + e;

    // Write the updated state to the output buffer
    output[0] = h0;
    output[1] = h1;
    output[2] = h2;
    output[3] = h3;
    output[4] = h4;
}
