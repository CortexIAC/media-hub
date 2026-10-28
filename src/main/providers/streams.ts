import { net } from 'electron'
import {
  classifyStream,
  extensionOfUrl,
  nameFromUrl,
  normalizeStreamUrl,
  parsePlaylist,
  streamIdFor,
  type StreamKind,
  type StreamSource
} from '@core/streams'

/**
 * Network stream helpers for the Streams screen.
 *
 * Everything here is a plain HTTP request for a URL the user typed or imported;
 * nothing is resolved, scraped or decrypted. The only judgement made is whether
 * Chromium can play the link or whether it belongs in a native player.
 */

const USER_AGENT = 'BunnyMediaHub/0.1 (desktop media player; +https://github.com/CortexIAC)'
const TIMEOUT_MS = 12_000
const TEXT_LIMIT_BYTES = 4 * 1024 * 1024

export interface StreamProbe {
  ok: boolean
  kind: StreamKind
  contentType: string | null
  finalUrl: string | null
  status: number | null
  error: string | null
}

export interface AddStreamResult {
  ok: boolean
  added: StreamSource[]
  skipped: number
  error: string | null
}

/**
 * Asks the server what it is serving. HEAD first because it is cheap; some
 * stream servers reject HEAD outright, so a one-byte ranged GET is the fallback.
 */
export async function probeStream(rawUrl: string): Promise<StreamProbe> {
  const url = normalizeStreamUrl(rawUrl)
  if (!url) {
    return {
      ok: false,
      kind: 'progressive',
      contentType: null,
      finalUrl: null,
      status: null,
      error: 'Only http(s) links can be played. Torrent and magnet links are not supported.'
    }
  }

  let head: Awaited<ReturnType<typeof request>> | null = null
  try {
    head = await request(url, 'HEAD')
  } catch {
    head = null
  }

  const headType = head?.response.headers.get('content-type') ?? null
  if (head?.response.ok && headType) {
    const finalUrl = head.finalUrl
    const classified = classifyStream(finalUrl, headType)
    return {
      ok: true,
      kind: classified.kind,
      contentType: headType,
      finalUrl,
      status: head.response.status,
      error: classified.kind === 'unsupported' ? classified.reason : null
    }
  }

  let get: { response: Response; finalUrl: string }
  try {
    get = await request(url, 'GET', 'bytes=0-0')
  } catch (error) {
    return {
      ok: false,
      kind: 'progressive',
      contentType: null,
      finalUrl: url,
      status: null,
      error: `Could not reach that stream: ${describe(error)}`
    }
  }

  const finalUrl = get.finalUrl
  const contentType = get.response.headers.get('content-type') ?? null
  if (!get.response.ok && get.response.status !== 206) {
    return {
      ok: false,
      kind: 'progressive',
      contentType,
      finalUrl,
      status: get.response.status,
      error: `The server answered ${get.response.status}. That link is not playable right now.`
    }
  }

  const classified = classifyStream(finalUrl, contentType)
  return {
    ok: true,
    kind: classified.kind,
    contentType,
    finalUrl,
    status: get.response.status,
    error: classified.kind === 'unsupported' ? classified.reason : null
  }
}

/**
 * Adds a link, expanding M3U/PLS channel lists into individual entries.
 *
 * An HLS playlist is stored as one stream: its contents are media segments, not
 * channels, and importing hundreds of three-second fragments would be useless.
 */
export async function addStreamFromUrl(rawUrl: string, name?: string): Promise<AddStreamResult> {
  const url = normalizeStreamUrl(rawUrl)
  if (!url) {
    return {
      ok: false,
      added: [],
      skipped: 0,
      error: 'That is not an http(s) address. Paste a stream link, an .m3u playlist or an .m3u8 HLS playlist.'
    }
  }

  const probe = await probeStream(url)
  if (!probe.ok) return { ok: false, added: [], skipped: 0, error: probe.error }

  const finalUrl = probe.finalUrl ?? url
  const textual =
    /mpegurl|m3u|pls|text\/plain|application\/octet-stream/i.test(probe.contentType ?? '') ||
    ['.m3u', '.m3u8', '.pls'].includes(extensionOfUrl(finalUrl))

  if (textual) {
    let text: { body: string; finalUrl: string } | null = null
    try {
      text = await fetchText(finalUrl)
    } catch {
      text = null
    }

    if (text) {
      const parsed = parsePlaylist(text.body)
      if (parsed.kind === 'm3u' || parsed.kind === 'pls') {
        const group = name?.trim() || nameFromUrl(text.finalUrl)
        const now = Date.now()
        const sources = parsed.entries.map((entry) => ({
          id: streamIdFor(entry.url),
          name: entry.name,
          url: entry.url,
          group: entry.group ?? group,
          logoUrl: entry.logoUrl,
          kind: classifyStream(entry.url).kind,
          addedAt: now,
          lastPlayedAt: null
        }))
        return { ok: true, added: sources, skipped: 0, error: null }
      }
      if (parsed.kind === 'hls') {
        return { ok: true, added: [singleSource(text.finalUrl, name, 'hls')], skipped: 0, error: null }
      }
      if (parsed.kind === 'empty' || parsed.kind === 'invalid') {
        return {
          ok: false,
          added: [],
          skipped: 0,
          error: 'That link answered, but its body is not a channel list or an HLS playlist.'
        }
      }
    }
  }

  if (probe.kind === 'unsupported') {
    // Still worth saving: the external player can open it, and the row explains
    // why the in-app player will refuse.
    return { ok: true, added: [singleSource(finalUrl, name, 'unsupported')], skipped: 0, error: probe.error }
  }

  return { ok: true, added: [singleSource(finalUrl, name, probe.kind)], skipped: 0, error: null }
}

function singleSource(url: string, name: string | undefined, kind: StreamKind): StreamSource {
  return {
    id: streamIdFor(url),
    name: name?.trim() || nameFromUrl(url),
    url,
    group: null,
    logoUrl: null,
    kind,
    addedAt: Date.now(),
    lastPlayedAt: null
  }
}

async function request(
  url: string,
  method: 'GET' | 'HEAD',
  range?: string
): Promise<{ response: Response; finalUrl: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const headers: Record<string, string> = { 'User-Agent': USER_AGENT, Accept: '*/*' }
  if (range) headers.Range = range
  try {
    const response = await net.fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers
    })
    return { response, finalUrl: response.url || url }
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`timed out after ${Math.round(TIMEOUT_MS / 1000)}s`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchText(url: string): Promise<{ body: string; finalUrl: string }> {
  const { response, finalUrl } = await request(url, 'GET')
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const declared = Number(response.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > TEXT_LIMIT_BYTES) {
    throw new Error('That playlist is too large to import.')
  }
  const body = await response.text()
  if (body.length > TEXT_LIMIT_BYTES) throw new Error('That playlist is too large to import.')
  return { body, finalUrl }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
