/**
 * Network stream models and pure helpers.
 *
 * Kept free of Electron, Node and DOM imports so the parsing, classification
 * and playlist-rewriting rules can be unit tested without a running app. The
 * main process owns the network I/O; this module only decides what a link is.
 */

export const STREAM_SCHEME = 'bunny-stream'

export type StreamKind = 'progressive' | 'hls' | 'unsupported'

export interface StreamSource {
  /** Stable id derived from the URL, so re-adding the same link is a no-op. */
  id: string
  name: string
  url: string
  group: string | null
  logoUrl: string | null
  kind: StreamKind
  addedAt: number
  lastPlayedAt: number | null
}

export interface PlaylistEntry {
  name: string
  url: string
  group: string | null
  logoUrl: string | null
}

export type PlaylistParse =
  /** A channel list that expands into individual streams. */
  | { kind: 'm3u' | 'pls'; entries: PlaylistEntry[] }
  /** An HLS playlist: the link itself is the stream, never its media segments. */
  | { kind: 'hls' }
  | { kind: 'empty' }
  | { kind: 'invalid' }

const MAX_URL_LENGTH = 4096

/** Extensions Chromium's media pipeline can demux and decode in this build. */
const PROGRESSIVE_EXTENSIONS = new Set([
  '.mp4',
  '.m4v',
  '.webm',
  '.ogv',
  '.ogg',
  '.oga',
  '.mp3',
  '.m4a',
  '.aac',
  '.wav',
  '.flac',
  '.opus'
])

/**
 * Containers Chromium cannot open. Handing these to the embedded player only
 * produces a bare MEDIA_ERR_SRC_NOT_SUPPORTED, so the app names the problem and
 * offers the external player instead of pretending a retry might help.
 */
const UNSUPPORTED_EXTENSIONS: Record<string, string> = {
  '.mkv': 'Matroska (MKV) is not decoded by Chromium',
  '.avi': 'AVI is not decoded by Chromium',
  '.wmv': 'Windows Media Video is not decoded by Chromium',
  '.flv': 'Flash Video is not decoded by Chromium',
  '.mpg': 'MPEG-1/2 program streams are not decoded by Chromium',
  '.mpeg': 'MPEG-1/2 program streams are not decoded by Chromium',
  '.m2ts': 'MPEG transport streams are not decoded by Chromium',
  '.mts': 'MPEG transport streams are not decoded by Chromium',
  '.ts': 'Raw MPEG transport streams are not decoded by Chromium',
  '.vob': 'DVD VOB files are not decoded by Chromium',
  '.rm': 'RealMedia is not decoded by Chromium',
  '.rmvb': 'RealMedia is not decoded by Chromium',
  '.divx': 'DivX is not decoded by Chromium',
  '.hevc': 'HEVC/H.265 is not decoded by Chromium',
  '.h265': 'HEVC/H.265 is not decoded by Chromium',
  '.wma': 'Windows Media Audio is not decoded by Chromium',
  '.mka': 'Matroska audio is not decoded by Chromium'
}

const UNSUPPORTED_MIME = new Set([
  'video/x-matroska',
  'video/x-msvideo',
  'video/x-ms-wmv',
  'video/x-flv',
  'video/mp2t',
  'video/mpeg',
  'video/dvd',
  'audio/x-ms-wma',
  'audio/x-matroska'
])

/** Rejects anything that is not an http(s) URL; torrent/magnet links included. */
export function normalizeStreamUrl(raw: string): string | null {
  const trimmed = String(raw ?? '').trim()
  if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (!url.hostname) return null
  return url.toString()
}

export function isStreamableUrl(raw: string): boolean {
  return normalizeStreamUrl(raw) !== null
}

/** FNV-1a: short, stable, and the same in every process. */
export function hashStreamUrl(url: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < url.length; index += 1) {
    hash ^= url.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function streamIdFor(url: string): string {
  return `stream-${hashStreamUrl(url)}`
}

/** A readable name from the link when the user or a playlist supplies none. */
export function nameFromUrl(rawUrl: string): string {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return 'Network stream'
  }
  const segments = url.pathname.split('/').filter(Boolean)
  const last = segments[segments.length - 1]
  if (!last) return url.hostname
  const decoded = safeDecode(last)
  // Strip the extension before the index prefix: `index.m3u8` is a placeholder
  // name, not a title, so the host is the honest label.
  const withoutExtension = decoded.replace(/\.[a-z0-9]{1,5}$/i, '')
  const withoutIndex = withoutExtension.replace(/^index$/i, '')
  const readable = withoutIndex.replace(/[._-]+/g, ' ').trim()
  return readable.length > 1 ? readable : url.hostname
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function streamHostLabel(rawUrl: string): string {
  try {
    return new URL(rawUrl).host
  } catch {
    return ''
  }
}

/**
 * Decides whether the embedded player should try, use HLS, or hand off.
 * Content-Type wins over the extension because servers routinely mislabel.
 */
export function classifyStream(
  rawUrl: string,
  contentType?: string | null
): { kind: StreamKind; reason: string | null } {
  const mime = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  const extension = extensionOfUrl(rawUrl)

  if (mime === 'application/vnd.apple.mpegurl' || mime === 'application/x-mpegurl' || mime === 'audio/mpegurl') {
    return { kind: 'hls', reason: null }
  }
  if (extension === '.m3u8' || extension === '.m3u') {
    return { kind: 'hls', reason: null }
  }
  if (mime.startsWith('video/') === false && mime.startsWith('audio/') === false && mime !== '') {
    return { kind: 'unsupported', reason: `The server sent ${mime}, which is not an audio or video stream.` }
  }
  if (UNSUPPORTED_MIME.has(mime)) {
    return { kind: 'unsupported', reason: `${mime} needs a native player such as VLC.` }
  }
  const unsupported = UNSUPPORTED_EXTENSIONS[extension]
  if (unsupported) {
    return { kind: 'unsupported', reason: `${unsupported}. Open it in an external player such as VLC.` }
  }
  if (PROGRESSIVE_EXTENSIONS.has(extension)) {
    return { kind: 'progressive', reason: null }
  }
  // Unknown extension and a generic content type: let Chromium have a go. It is
  // the only real test, and its failure is reported through the media element.
  return { kind: 'progressive', reason: null }
}

export function extensionOfUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    const name = url.pathname.split('/').pop() ?? ''
    const dot = name.lastIndexOf('.')
    return dot <= 0 ? '' : name.slice(dot).toLowerCase()
  } catch {
    return ''
  }
}

const EXTINF_ATTRIBUTE = /([a-zA-Z0-9-]+)="([^"]*)"/g

/**
 * Parses an M3U/PLS channel list.
 *
 * An HLS playlist (`#EXT-X-*`) is deliberately *not* expanded: its entries are
 * media segments, and importing a thousand three-second fragments as separate
 * "streams" would be useless. The caller saves the playlist URL itself instead.
 */
export function parsePlaylist(text: string): PlaylistParse {
  const body = String(text ?? '').replace(/^\uFEFF/, '').trim()
  if (body.length === 0) return { kind: 'empty' }

  const head = body.slice(0, 512).toLowerCase()
  if (head.includes('#ext-x-')) return { kind: 'hls' }
  if (head.startsWith('[playlist]') || /^file1=/im.test(body)) return parsePls(body)
  if (head.startsWith('#extm3u') || /^https?:\/\//im.test(body)) {
    const entries = parseM3u(body)
    return entries.length > 0 ? { kind: 'm3u', entries } : { kind: 'empty' }
  }
  return { kind: 'invalid' }
}

function parseM3u(body: string): PlaylistEntry[] {
  const lines = body.split(/\r?\n/)
  const entries: PlaylistEntry[] = []
  let pending: { name: string | null; group: string | null; logo: string | null } | null = null
  let pendingGroup: string | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.length === 0) continue

    if (line.startsWith('#EXTINF')) {
      const comma = line.indexOf(',')
      const attributeSource = comma === -1 ? line : line.slice(0, comma)
      const title = comma === -1 ? '' : line.slice(comma + 1).trim()
      const attributes = new Map<string, string>()
      for (const match of attributeSource.matchAll(EXTINF_ATTRIBUTE)) {
        const key = match[1]
        const value = match[2]
        if (key && value !== undefined) attributes.set(key.toLowerCase(), value)
      }
      pending = {
        name: title.length > 0 ? title : null,
        group: attributes.get('group-title') ?? pendingGroup,
        logo: attributes.get('tvg-logo') ?? attributes.get('logo') ?? null
      }
      continue
    }

    if (line.startsWith('#EXTGRP:')) {
      pendingGroup = line.slice('#EXTGRP:'.length).trim() || null
      continue
    }
    if (line.startsWith('#')) continue

    const url = normalizeStreamUrl(line)
    if (!url) {
      pending = null
      continue
    }
    entries.push({
      name: pending?.name ?? nameFromUrl(url),
      url,
      group: pending?.group ?? pendingGroup,
      logoUrl: normalizeLogo(pending?.logo ?? null)
    })
    pending = null
  }

  return entries
}

function parsePls(body: string): PlaylistParse {
  const files = new Map<number, string>()
  const titles = new Map<number, string>()
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim()
    const match = /^([a-z]+)(\d+)\s*=\s*(.*)$/i.exec(line)
    if (!match) continue
    const key = (match[1] ?? '').toLowerCase()
    const index = Number(match[2])
    const value = (match[3] ?? '').trim()
    if (!Number.isFinite(index)) continue
    if (key === 'file') files.set(index, value)
    if (key === 'title') titles.set(index, value)
  }

  const entries: PlaylistEntry[] = []
  for (const index of [...files.keys()].sort((a, b) => a - b)) {
    const url = normalizeStreamUrl(files.get(index) ?? '')
    if (!url) continue
    const title = titles.get(index)?.trim()
    entries.push({ name: title && title.length > 0 ? title : nameFromUrl(url), url, group: null, logoUrl: null })
  }
  return entries.length > 0 ? { kind: 'pls', entries } : { kind: 'empty' }
}

function normalizeLogo(raw: string | null): string | null {
  if (!raw) return null
  return normalizeStreamUrl(raw)
}

/**
 * Rewrites every URI in an HLS playlist through `resolveUri`.
 *
 * Master playlists, media playlists, encryption keys and init segments all carry
 * absolute or relative URLs; leaving any of them untouched makes the browser
 * fetch the original host directly, which the app's content security policy
 * blocks. Resolution against the playlist's final URL happens in the callback.
 */
export function rewriteHlsPlaylist(text: string, resolveUri: (uri: string) => string): string {
  const lines = String(text ?? '').split(/\r?\n/)
  const output: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      output.push(line)
      continue
    }
    if (trimmed.startsWith('#')) {
      if (!trimmed.includes('URI="')) {
        output.push(line)
        continue
      }
      output.push(
        line.replace(/URI="([^"]*)"/g, (_match, uri: string) => {
          const resolved = resolveUri(uri)
          return `URI="${resolved}"`
        })
      )
      continue
    }
    output.push(resolveUri(trimmed))
  }

  return output.join('\n')
}

/** True when a response body is a playlist worth rewriting rather than piping. */
export function looksLikeHlsPlaylist(text: string, contentType?: string | null): boolean {
  const mime = (contentType ?? '').toLowerCase()
  if (mime.includes('mpegurl')) return true
  return text.trimStart().startsWith('#EXTM3U')
}

/** Coerces a stored or user-supplied entry into something safe to play. */
export function sanitizeStreamSource(raw: unknown): StreamSource | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<StreamSource>
  if (typeof value.url !== 'string') return null
  const url = normalizeStreamUrl(value.url)
  if (!url) return null
  const kind: StreamKind =
    value.kind === 'hls' || value.kind === 'progressive' || value.kind === 'unsupported'
      ? value.kind
      : classifyStream(url).kind
  const name =
    typeof value.name === 'string' && value.name.trim().length > 0
      ? value.name.trim().slice(0, 200)
      : nameFromUrl(url)
  return {
    id: streamIdFor(url),
    name,
    url,
    group: typeof value.group === 'string' && value.group.trim() ? value.group.trim().slice(0, 120) : null,
    logoUrl: typeof value.logoUrl === 'string' ? normalizeLogo(value.logoUrl) : null,
    kind,
    addedAt: typeof value.addedAt === 'number' && Number.isFinite(value.addedAt) ? value.addedAt : Date.now(),
    lastPlayedAt:
      typeof value.lastPlayedAt === 'number' && Number.isFinite(value.lastPlayedAt) ? value.lastPlayedAt : null
  }
}
