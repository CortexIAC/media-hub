import { useEffect, useState } from 'react'
import type { ProviderDescriptor } from '@core/providers'
import type { AppInfo } from '@shared/ipc'

export function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    let cancelled = false
    void window.bunny.app
      .info()
      .then((value) => {
        if (!cancelled) setInfo(value)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  return info
}

export function useProviders(): ProviderDescriptor[] {
  const [providers, setProviders] = useState<ProviderDescriptor[]>([])
  useEffect(() => {
    let cancelled = false
    void window.bunny.providers
      .list()
      .then((value) => {
        if (!cancelled) setProviders(value)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  return providers
}
