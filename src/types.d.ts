declare class Terminal {
  open(element: HTMLElement | null)
  write(smessage: string)
  loadAddon(addon: any)
}

declare class FitAddon{
  fit()
}
