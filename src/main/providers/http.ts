/**
 * Small JSON fetch helper for the public catalogue APIs.
 *
 * Every request is time-boxed, sends a descriptive User-Agent (the Internet
 * Archive asks for one), and never retries in a loop — callers surface the
 * failure to the UI instead of hammering a service.
 */

const USER_AGENT = 'BunnyMediaHub/0.1 (desktop media library; +https://github.com/CortexIAC)'

export class HttpError extends Error {
  readonly status: number

  constructor(status: number, url: string) {
    super(`HTTP ${status} from ${new URL(url).host}`)
    this.name = 'HttpError'
    this.status = status
  }
}

export interface FetchJsonOptions {
  timeoutMs?: number
  signal?: AbortSignal
  method?: 'GET' | 'POST'
  body?: unknown
  headers?: Record<string, string>
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 9000
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const abort = (): void => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      method: options.method ?? 'GET',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers
      }
    })
    if (!response.ok) throw new HttpError(response.status, url)
    return (await response.json()) as T
  } catch (error) {
    if (timedOut) throw new Error(`timed out after ${Math.round(timeoutMs / 1000)}s`)
    throw error
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abort)
  }
}

/** Escapes a value for a Lucene query, which the Internet Archive uses. */
export function escapeLucene(value: string): string {
  return value.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, '\\$1')
}

export function truncate(value: string | null | undefined, max = 220): string | null {
  if (!value) return null
  const clean = value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (clean.length === 0) return null
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}
