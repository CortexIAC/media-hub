import type { BunnyApi } from '@shared/ipc'

declare global {
  interface Window {
    bunny: BunnyApi
  }
}

export {}
