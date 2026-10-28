import { fetchJson } from './http'

/**
 * LRCLIB lyrics lookup.
 *
 * LRCLIB is a free, open lyrics service (no key, no account). We ask for an
 * exact match first and fall back to its search endpoint, preferring synced
 * (LRC) lyrics when more than one record exists.
 */

export interface LyricsPayload {
  text: string
  synced: boolean
  provider: 'LRCLIB'
  providerUrl: string
}

interface LrclibRecord {
  id?: number
  trackName?: string
  artistName?: string
  albumName?: string
  duration?: number
  instrumental?: boolean
  plainLyrics?: string | null
  syncedLyrics?: string | null
}

export interface LyricsQuery {
  trackName: string
  artistName: string
  albumName: string
  durationMs: number
}

export async function fetchLyrics(query: LyricsQuery, signal?: AbortSignal): Promise<LyricsPayload | null> {
  const title = query.trackName.trim()
  const artist = query.artistName.trim()
  if (!title || !artist) return null

  const exact = new URLSearchParams({ track_name: title, artist_name: artist })
  if (query.albumName.trim()) exact.set('album_name', query.albumName.trim())
  if (query.durationMs > 0) exact.set('duration', String(Math.round(query.durationMs / 1000)))

  try {
    const record = await fetchJson<LrclibRecord>(`https://lrclib.net/api/get?${exact.toString()}`, {
      signal,
      timeoutMs: 7000
    })
    const payload = toPayload(record)
    if (payload) return payload
  } catch {
    // Exact match misses are normal; fall through to search.
  }

  try {
    const search = new URLSearchParams({ track_name: title, artist_name: artist })
    const records = await fetchJson<LrclibRecord[]>(`https://lrclib.net/api/search?${search.toString()}`, {
      signal,
      timeoutMs: 7000
    })
    const candidates = records
      .map((record) => toPayload(record))
      .filter((payload): payload is LyricsPayload => payload !== null)
    if (candidates.length === 0) return null
    return candidates.find((candidate) => candidate.synced) ?? candidates[0] ?? null
  } catch {
    return null
  }
}

function toPayload(record: LrclibRecord): LyricsPayload | null {
  if (!record || record.instrumental) return null
  const synced = typeof record.syncedLyrics === 'string' && record.syncedLyrics.trim().length > 0
  const text = synced ? record.syncedLyrics : record.plainLyrics
  if (!text || text.trim().length === 0) return null
  return {
    text: text.trim(),
    synced,
    provider: 'LRCLIB',
    providerUrl: record.id ? `https://lrclib.net/lyrics/${record.id}` : 'https://lrclib.net'
  }
}
