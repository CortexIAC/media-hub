import type { DiscoveryResult } from '@core/discovery'
import { fetchJson } from './http'

/**
 * YouTube Data API v3 search.
 *
 * Search only. YouTube's Developer Policies require playback inside the
 * official embedded player, forbid separating audio from video, and forbid
 * background playback, so results link to youtube.com instead of being
 * resolved into a stream.
 */

interface YouTubeSearchItem {
  id?: { videoId?: string }
  snippet?: {
    title?: string
    channelTitle?: string
    publishedAt?: string
    description?: string
  }
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[]
  error?: { message?: string }
}

export class YouTubeKeyMissingError extends Error {
  constructor() {
    super('No YouTube Data API key is configured.')
    this.name = 'YouTubeKeyMissingError'
  }
}

export async function searchYouTube(
  query: string,
  apiKey: string,
  limit: number,
  signal?: AbortSignal
): Promise<DiscoveryResult[]> {
  const key = apiKey.trim()
  if (!key) throw new YouTubeKeyMissingError()

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    maxResults: String(Math.min(25, Math.max(1, limit))),
    q: query,
    key
  })
  const data = await fetchJson<YouTubeSearchResponse>(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, {
    signal
  })
  if (data.error?.message) throw new Error(data.error.message)

  return (data.items ?? []).flatMap((item) => {
    const videoId = item.id?.videoId
    const title = item.snippet?.title
    if (!videoId || !title) return []
    const year = item.snippet?.publishedAt ? Number.parseInt(item.snippet.publishedAt.slice(0, 4), 10) : NaN
    return [
      {
        id: videoId,
        source: 'youtube' as const,
        kind: 'video' as const,
        title,
        creator: item.snippet?.channelTitle ?? null,
        year: Number.isFinite(year) ? year : null,
        description: null,
        detailUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
        accessUrl: null,
        accessKind: 'external' as const,
        accessLabel: 'Open on YouTube',
        // The API terms prohibit extracting audio, so this stays a link.
        rights: 'Playback only in YouTube’s own player'
      }
    ]
  })
}
