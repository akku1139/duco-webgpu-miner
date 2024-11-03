# duco-webgpu-miner
Duino-Coin Miner with WebGPU

## Memo

https://github.com/xmrig/xmrig/blob/ee65b3d159e5cfbbf13d444fba7f08df0addbe72/src/crypto/rx/RxBasicStorage.cpp#L89

https://github.com/xmrig/xmrig/blob/ee65b3d159e5cfbbf13d444fba7f08df0addbe72/src/base/io/log/Log.h#L145

https://github.com/revoxhere/duco-webservices/blob/master/js/webminer/worker.js

https://server.duinocoin.com/js/webminer/worker.js?v=3

## WebSocket Job Protocol

### Recv

- 3.0 (version data)
- GOOD(\n)
- BAD
- This user doesn't exist
- Too many workers
- [Job data] (40+ length)

### Send

- JOB
- [result data]

### Other

- Auto Reconnect
