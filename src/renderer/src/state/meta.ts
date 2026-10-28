import { useCallback, useEffect, useState } from 'react'
import type { ProviderDescriptor } from '@core/providers'
import type { AppInfo, UpdateStatus } from '@shared/ipc'

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

export interface UpdateControls {
  status: UpdateStatus | null
  /** True while a check or a download is running. */
  busy: boolean
  check: () => void
  download: () => void
  install: () => void
}

/**
 * Subscribes to the main-process updater. The status object is pushed on every
 * phase change (including download progress), so the panel never polls.
 */
export function useUpdates(): UpdateControls {
  const [status, setStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.bunny.updates
      .status()
      .then((value) => {
        if (!cancelled) setStatus(value)
      })
      .catch(() => undefined)
    const unsubscribe = window.bunny.updates.onChanged((value) => setStatus(value))
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const run = useCallback((action: () => Promise<UpdateStatus | void>) => {
    void action().catch(() => undefined)
  }, [])

  const check = useCallback(() => run(() => window.bunny.updates.check()), [run])
  const download = useCallback(() => run(() => window.bunny.updates.download()), [run])
  const install = useCallback(() => {
    void window.bunny.updates.install().catch(() => undefined)
  }, [])

  const busy = status?.phase === 'checking' || status?.phase === 'downloading'

  return { status, busy, check, download, install }
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
