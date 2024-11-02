if(!navigator.gpu) {
  log.emit("gpu", "Yout browser is not suppoting WebGPU. stopping...")
  return
}

if (!device) {
  log.emit("gpu", "No device detected. stopping...")
  return
}
