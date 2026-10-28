/**
 * YouTube identifiers and links.
 *
 * Pure helpers shared by the main process (search, oEmbed) and the renderer
 * (player, queue). Only documented identifiers are handled: video ids, playlist
 * ids and the public watch/shorts/embed URL shapes.
 */

export interface YouTubeVideo {
  /** 11-character YouTube video id. Stable; never a stream URL. */
  id: string
  title: string
  channel: string | null
  thumbnailUrl: string
  url: string
  durationMs: number | null
  description: string | null
}

export interface YouTubeTarget {
  kind: 'video' | 'playlist'
  id: string
}

export const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,64}$/
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtu.be'
])

/**
 * Accepts a bare video id, a watch/shorts/embed/live link, a youtu.be link or a
 * playlist link, and returns the identifier it points at. Anything else is
 * rejected instead of guessed.
 */
export function parseYouTubeTarget(raw: string): YouTubeTarget | null {
  const value = raw.trim()
  if (!value) return null
  if (YOUTUBE_ID.test(value)) return { kind: 'video', id: value }
  if (/^https?:\/\//i.test(value) === false && !value.startsWith('youtu')) return null

  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  if (!YOUTUBE_HOSTS.has(host)) return null

  const list = url.searchParams.get('list')
  if (url.pathname === '/playlist' && list && PLAYLIST_ID.test(list)) {
    return { kind: 'playlist', id: list }
  }
  if (url.pathname === '/watch' || url.pathname === '/watch/') {
    const id = url.searchParams.get('v')
    return id && YOUTUBE_ID.test(id) ? { kind: 'video', id } : null
  }

  const segments = url.pathname.split('/').filter(Boolean)
  if ((segments[0] === 'shorts' || segments[0] === 'embed' || segments[0] === 'live' || segments[0] === 'v') && segments[1]) {
    const id = segments[1]
    return YOUTUBE_ID.test(id) ? { kind: 'video', id } : null
  }
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    const id = segments[0]
    return id && YOUTUBE_ID.test(id) ? { kind: 'video', id } : null
  }
  return null
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`
}

export function youtubeChannelUrl(channel: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(channel)}`
}

/** Parses ISO 8601 durations such as PT3M42S from the Data API. */
export function parseIsoDuration(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value)
  if (!match) return null
  const days = Number(match[1] ?? 0)
  const hours = Number(match[2] ?? 0)
  const minutes = Number(match[3] ?? 0)
  const seconds = Number(match[4] ?? 0)
  if (days + hours + minutes + seconds <= 0) return null
  return Math.round(((days * 24 + hours) * 60 * 60 + minutes * 60 + seconds) * 1000)
}

export function formatYouTubeTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * Parses the search page YouTube's own web player requests.
 *
 * The payload is a deep tree of renderers; only the fields this app shows are
 * read, and anything malformed is skipped rather than guessed at. Kept pure so
 * it can be tested without a network call.
 */
export function parseYouTubeSearchPage(payload: unknown): YouTubeVideo[] {
  const renderers: Record<string, unknown>[] = []
  collectRenderers(payload, renderers, 0)

  const videos: YouTubeVideo[] = []
  for (const renderer of renderers) {
    const video = videoFromRenderer(renderer)
    if (video) videos.push(video)
  }
  return uniqueVideos(videos)
}

const RENDERER_KEYS = ['videoRenderer', 'compactVideoRenderer'] as const
const MAX_DEPTH = 24

function collectRenderers(node: unknown, output: Record<string, unknown>[], depth: number): void {
  if (depth > MAX_DEPTH || !node || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (RENDERER_KEYS.includes(key as (typeof RENDERER_KEYS)[number]) && value && typeof value === 'object') {
      output.push(value as Record<string, unknown>)
      continue
    }
    collectRenderers(value, output, depth + 1)
  }
}

function videoFromRenderer(renderer: Record<string, unknown>): YouTubeVideo | null {
  const id = typeof renderer.videoId === 'string' ? renderer.videoId : null
  if (!id || !YOUTUBE_ID.test(id)) return null

  const title = readText(renderer.title)
  if (!title) return null

  const channel = readText(renderer.ownerText) ?? readText(renderer.longBylineText) ?? readText(renderer.shortBylineText)
  const description = readText(renderer.descriptionSnippet)
  const length = readText(renderer.lengthText)

  return {
    id,
    title: title.slice(0, 300),
    channel: channel ? channel.slice(0, 200) : null,
    thumbnailUrl: youtubeThumbnailUrl(id),
    url: youtubeWatchUrl(id),
    durationMs: parseYouTubeLength(length),
    description: description ? description.slice(0, 2000) : null
  }
}

/** Reads a run-based text node (`{ runs: [{ text }] }`) or `{ simpleText }`. */
function readText(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null
  const value = node as { simpleText?: unknown; runs?: Array<{ text?: unknown }> }
  if (typeof value.simpleText === 'string') return decodeHtmlEntities(value.simpleText.trim())
  if (Array.isArray(value.runs)) {
    const joined = value.runs
      .map((run) => (typeof run?.text === 'string' ? run.text : ''))
      .join('')
      .trim()
    return joined ? decodeHtmlEntities(joined) : null
  }
  return null
}

/** Parses "2:26", "1:02:26" or "live" into milliseconds. */
export function parseYouTubeLength(text: string | null | undefined): number | null {
  if (!text) return null
  const trimmed = text.trim()
  if (!/^\d{1,2}(:\d{2}){1,2}$/.test(trimmed)) return null
  const parts = trimmed.split(':').map((part) => Number.parseInt(part, 10))
  if (parts.some((part) => !Number.isFinite(part))) return null
  const seconds = parts.reduce((total, part) => total * 60 + part, 0)
  return seconds > 0 ? seconds * 1000 : null
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' '
}

export function decodeHtmlEntities(value: string): string {
  if (!value.includes('&')) return value
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return ENTITIES[entity.toLowerCase()] ?? match
  })
}

/** Trims a list to unique video ids while preserving order. */
export function uniqueVideos(videos: readonly YouTubeVideo[]): YouTubeVideo[] {
  const seen = new Set<string>()
  const output: YouTubeVideo[] = []
  for (const video of videos) {
    if (seen.has(video.id)) continue
    seen.add(video.id)
    output.push(video)
  }
  return output
}
