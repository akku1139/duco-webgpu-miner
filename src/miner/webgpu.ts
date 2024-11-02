if(!navigator.gpu) {
  log.emit("webgpu", "Yout browser is not suppoting WebGPU. stopping...")
  return
}

if (!device) {
  log.emit("webgpu", "No device detected. stopping...")
  return
}
