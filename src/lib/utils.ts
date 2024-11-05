export const roundAndString = (value: number, digit: number): string => {
  return value.toFixed(digit)
}

// https://github.com/xmrig/xmrig/blob/9580f5395f8e5b108f726e04583d7dd8f8d36ec4/src/base/net/stratum/NetworkState.cpp#L226
export const addSIPrefix = (value: number, space: string = ""): string => {
  if (value >= 100000000000) {
    return (value / 1000000000).toString() + space + "G"
  }

  if (value >= 100000000) {
    return (value / 1000000).toString() + space + "M"
  }

  if (value >= 1000000) {
    return (value / 1000).toString() + space + "K"
  }

  return value.toString()
}
