# duco-webgpu-miner
Duino-Coin Miner with WebGPU

## Memo

### Duco

https://github.com/xmrig/xmrig/blob/ee65b3d159e5cfbbf13d444fba7f08df0addbe72/src/crypto/rx/RxBasicStorage.cpp#L89

https://github.com/xmrig/xmrig/blob/ee65b3d159e5cfbbf13d444fba7f08df0addbe72/src/base/io/log/Log.h#L145

https://github.com/revoxhere/duco-webservices/blob/master/js/webminer/worker.js

https://server.duinocoin.com/js/webminer/worker.js?v=3

### SHA-1

https://github.com/revoxhere/duino-coin/blob/master/Arduino_Code/duco_hash.cpp

https://github.com/fatestudio/sha1/blob/master/sha1-fast.c

### WebGPU

https://qiita.com/metaphysical_bard/items/db74484d631038bb7ae1

### Wasm

https://ukyo.github.io/wasm-usui-book/webroot/get-started-webassembly.html

https://zenn.dev/itte/articles/57021ace128fff

### Others

https://github.com/mys1024/vite-plugin-wat

## TODOs

- hashrate

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
