import { useEffect, useRef, useState } from 'react'
import type { DiscoveryKind, DiscoveryResponse } from '@core/discovery'

export interface DiscoveryState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  data: DiscoveryResponse | null
  error: string | null
}

/**
 * Debounced online-catalogue search. Requests run in the main process, so the
 * renderer never needs network permissions, and a slow source cannot block the
 * UI. Late responses are discarded when the query has moved on.
 */
export function useDiscovery(query: string, kinds?: DiscoveryKind[], delayMs = 350): DiscoveryState {
  const [state, setState] = useState<DiscoveryState>({ status: 'idle', data: null, error: null })
  const kindsRef = useRef(kinds)
  kindsRef.current = kinds
  const kindKey = kinds?.join(',') ?? ''

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setState({ status: 'idle', data: null, error: null })
      return
    }

    let cancelled = false
    setState((previous) => ({ status: 'loading', data: previous.data, error: null }))
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const data = await window.bunny.discovery.search(trimmed, kindsRef.current)
          if (!cancelled) setState({ status: 'ready', data, error: null })
        } catch (error) {
          if (!cancelled) {
            setState({
              status: 'error',
              data: null,
              error: error instanceof Error ? error.message : String(error)
            })
          }
        }
      })()
    }, delayMs)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, kindKey, delayMs])

  return state
}
