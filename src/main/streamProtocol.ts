import { net, protocol } from 'electron'
import { STREAM_SCHEME, looksLikeHlsPlaylist, normalizeStreamUrl, rewriteHlsPlaylist } from '@core/streams'

/**
 * bunny-stream://proxy/<encoded absolute url>
 *
 * Remote media is fetched by the main process and handed to the renderer through
 * this scheme instead of letting the page talk to the internet. That keeps three
 * properties the rest of the app relies on:
 *
 * - the content security policy can stay closed (only this scheme is allowed as
 *   a media/connect source, no wildcard https:),
 * - responses are CORS-enabled, which Web Audio requires before it will read
 *   samples at all,
 * - HLS playlists can be rewritten so their segments, keys and init segments
 *   also come through here instead of hitting the origin directly.
 *
 * This is a pass-through for URLs the user supplies. It does not scrape, resolve
 * or decrypt anything: whatever the URL serves is what the player receives.
 */

const USER_AGENT = 'BunnyMediaHub/0.1 (desktop media player; +https://github.com/CortexIAC)'
const HEADER_TIMEOUT_MS = 20_000
/** Playlists are rewritten in memory, so they must stay small. */
const PLAYLIST_LIMIT_BYTES = 4 * 1024 * 1024

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Accept, Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
  'Cache-Control': 'no-store'
}

export function registerStreamScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: STREAM_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        // hls.js fetches playlists and segments through this scheme; without CORS
        // the requests are refused, and Web Audio outputs silence for the same
        // reason it did for uncorsed local media.
        corsEnabled: true,
        stream: true,
        bypassCSP: false
      }
    }
  ])
}

/** The only way the renderer ever addresses a remote stream. */
export function streamProxyUrl(rawUrl: string): string {
  return `${STREAM_SCHEME}://proxy/${encodeURIComponent(rawUrl)}`
}

export function registerStreamProtocol(): void {
  protocol.handle(STREAM_SCHEME, async (request) => handleStreamRequest(request))
}

async function handleStreamRequest(request: Request): Promise<Response> {
  let parsed: URL
  try {
    parsed = new URL(request.url)
  } catch {
    return textResponse(400, 'Bad request')
  }
  if (parsed.hostname !== 'proxy') return textResponse(404, 'Unknown stream address')

  const target = safeDecode(parsed.pathname.replace(/^\//, ''))
  const url = normalizeStreamUrl(target)
  if (!url) return textResponse(400, 'Only http(s) stream URLs can be proxied.')

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...CORS_HEADERS, 'Content-Length': '0' } })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), HEADER_TIMEOUT_MS)

  let response: Response
  try {
    response = await net.fetch(url, {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: buildUpstreamHeaders(request)
    })
  } catch (error) {
    clearTimeout(timeout)
    const message = controller.signal.aborted
      ? `The stream did not answer within ${Math.round(HEADER_TIMEOUT_MS / 1000)}s.`
      : describe(error)
    console.warn(`[stream] ${url}: ${message}`)
    return textResponse(502, message)
  }
  // Headers are in; the body streams on its own schedule.
  clearTimeout(timeout)

  const contentType = response.headers.get('content-type')
  const finalUrl = response.url || url

  // A playable response is piped straight through with its range headers intact,
  // so seeking works without the app buffering whole files.
  if (!isPlaylistCandidate(finalUrl, contentType, response, request.method)) {
    return pipeResponse(response, contentType)
  }

  let text: string
  try {
    text = await response.text()
  } catch (error) {
    return textResponse(502, `Could not read the playlist: ${describe(error)}`)
  }
  if (text.length > PLAYLIST_LIMIT_BYTES) {
    return textResponse(413, 'That playlist is too large to load.')
  }

  // HLS: every URI is rewritten to come back through this proxy.
  if (looksLikeHlsPlaylist(text, contentType) && /#EXT-X-/i.test(text)) {
    const rewritten = rewriteHlsPlaylist(text, (uri) => {
      const absolute = resolveAgainst(finalUrl, uri)
      return absolute ? streamProxyUrl(absolute) : uri
    })
    return new Response(rewritten, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Content-Length': String(Buffer.byteLength(rewritten, 'utf8'))
      }
    })
  }

  // Some other text document (a channel list, an error page). Pass it on so the
  // player can fail honestly instead of receiving bytes it cannot demux.
  return new Response(text, {
    status: response.status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': contentType ?? 'application/octet-stream',
      'Content-Length': String(Buffer.byteLength(text, 'utf8'))
    }
  })
}

function buildUpstreamHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT }
  const range = request.headers.get('range')
  if (range) headers.Range = range
  const accept = request.headers.get('accept')
  headers.Accept = accept && accept.length > 0 ? accept : '*/*'
  return headers
}

function isPlaylistCandidate(finalUrl: string, contentType: string | null, response: Response, method: string): boolean {
  if (method === 'HEAD' || !response.ok) return false
  const mime = (contentType ?? '').toLowerCase()
  if (mime.includes('mpegurl')) return true
  let path = ''
  try {
    path = safeDecode(new URL(finalUrl).pathname).toLowerCase()
  } catch {
    return false
  }
  return path.endsWith('.m3u8') || path.endsWith('.m3u')
}

function pipeResponse(response: Response, contentType: string | null): Response {
  const headers: Record<string, string> = { ...CORS_HEADERS }
  const passthrough: Array<[string, string]> = [
    ['content-length', 'Content-Length'],
    ['content-range', 'Content-Range'],
    ['accept-ranges', 'Accept-Ranges'],
    ['last-modified', 'Last-Modified']
  ]
  for (const [source, target] of passthrough) {
    const value = response.headers.get(source)
    if (value) headers[target] = value
  }
  headers['Content-Type'] = contentType ?? 'application/octet-stream'

  // 206 is preserved so Chromium knows a seek is already satisfied.
  return new Response(response.body, { status: response.status, headers })
}

function resolveAgainst(base: string, uri: string): string | null {
  try {
    const resolved = new URL(uri, base)
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null
    return resolved.toString()
  } catch {
    return null
  }
}

function textResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }
  })
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/^Error:\s*/, '')
}
