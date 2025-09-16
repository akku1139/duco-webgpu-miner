// https://github.com/revoxhere/duino-coin/blob/4ad3c657bc59553b76246afd39d3d02c9fc9ea42/Arduino_Code/duco_hash.h
/*
MIT License

Copyright (c) 2019-present Robert Piotrowski

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

#pragma once

#include <Arduino.h>

#define SHA1_BLOCK_LEN 64
#define SHA1_HASH_LEN 20

struct duco_hash_state_t {
	uint8_t buffer[SHA1_BLOCK_LEN];
	uint8_t result[SHA1_HASH_LEN];
	uint32_t tempState[5];

	uint8_t block_offset;
	uint8_t total_bytes;
};

void duco_hash_init(duco_hash_state_t * hasher, char const * prevHash);

uint8_t const * duco_hash_try_nonce(duco_hash_state_t * hasher, char const * nonce);
