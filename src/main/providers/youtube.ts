import type { YouTubeVideo } from '@core/youtube'
import { parseIsoDuration, parseYouTubeSearchPage, youtubeThumbnailUrl, youtubeWatchUrl } from '@core/youtube'
import { fetchJson } from './http'

/**
 * YouTube search and metadata.
 *
 * Two search paths:
 *  1. The documented Data API v3, when the user has supplied their own key.
 *  2. No key at all: the same search request YouTube's own web player sends to
 *     its internal `/youtubei/v1/search` endpoint. It needs no account and no
 *     key, returns the same public results, and is what makes the app usable
 *     out of the box. It is not a documented public API, so failures are
 *     reported rather than retried forever, and a key always takes priority.
 *
 * Metadata for a pasted link uses the public oEmbed endpoint. Playback itself
 * always happens in the official embedded player in the renderer; no stream URL
 * is requested, extracted or produced.
 */

interface SearchItem {
  id?: { videoId?: string }
  snippet?: {
    title?: string
    channelTitle?: string
    description?: string
  }
}

interface SearchResponse {
  items?: SearchItem[]
  error?: { message?: string }
}

interface VideosResponse {
  items?: Array<{ id?: string; contentDetails?: { duration?: string } }>
  error?: { message?: string }
}

interface OEmbedResponse {
  title?: string
  author_name?: string
  thumbnail_url?: string
}

export class YouTubeKeyMissingError extends Error {
  constructor() {
    super('No YouTube Data API key is configured. Add one in Settings → Online catalogues, or paste a video link.')
    this.name = 'YouTubeKeyMissingError'
  }
}

export async function searchYouTubeVideos(
  query: string,
  apiKey: string,
  limit: number,
  signal?: AbortSignal
): Promise<YouTubeVideo[]> {
  const key = apiKey.trim()
  if (!key) throw new YouTubeKeyMissingError()

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    maxResults: String(Math.min(25, Math.max(1, limit))),
    q: query,
    key
  })
  const data = await fetchJson<SearchResponse>(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, { signal })
  if (data.error?.message) throw new Error(data.error.message)

  const videos: YouTubeVideo[] = (data.items ?? []).flatMap((item) => {
    const id = item.id?.videoId
    const title = item.snippet?.title
    if (!id || !title) return []
    return [
      {
        id,
        title: decodeHtml(title),
        channel: item.snippet?.channelTitle ? decodeHtml(item.snippet.channelTitle) : null,
        thumbnailUrl: youtubeThumbnailUrl(id),
        url: youtubeWatchUrl(id),
        durationMs: null,
        description: item.snippet?.description ? decodeHtml(item.snippet.description) : null
      }
    ]
  })

  return withDurations(videos, key, signal)
}

/** One extra quota unit for the whole batch; durations are optional. */
async function withDurations(videos: YouTubeVideo[], key: string, signal?: AbortSignal): Promise<YouTubeVideo[]> {
  if (videos.length === 0) return videos
  const params = new URLSearchParams({
    part: 'contentDetails',
    id: videos.map((video) => video.id).join(','),
    key
  })
  try {
    const data = await fetchJson<VideosResponse>(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`, {
      signal,
      timeoutMs: 7000
    })
    const durations = new Map<string, number | null>()
    for (const item of data.items ?? []) {
      if (item.id) durations.set(item.id, parseIsoDuration(item.contentDetails?.duration))
    }
    return videos.map((video) => ({ ...video, durationMs: durations.get(video.id) ?? video.durationMs }))
  } catch {
    // Durations are a nicety; search results remain usable without them.
    return videos
  }
}

/**
 * Keyless search through YouTube's own web search endpoint.
 *
 * The client version is a plain date string; YouTube keeps older WEB client
 * versions working for years, and a rejected version surfaces as an error the
 * UI can show instead of a silent empty list.
 */
export async function searchYouTubeKeyless(query: string, limit: number, signal?: AbortSignal): Promise<YouTubeVideo[]> {
  const text = query.trim()
  if (text.length < 2) return []

  const payload = {
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20240726.00.00',
        hl: 'en',
        gl: 'US'
      }
    },
    query: text
  }

  const data = await fetchJson<unknown>('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
    method: 'POST',
    body: payload,
    signal,
    timeoutMs: 12_000,
    headers: { 'Accept-Language': 'en-US,en;q=0.9' }
  })

  const videos = parseYouTubeSearchPage(data)
  if (videos.length === 0) {
    throw new Error('YouTube returned no playable results for that search.')
  }
  return videos.slice(0, Math.min(25, Math.max(1, limit)))
}

export interface ResolvedYouTubeVideo {
  video: YouTubeVideo | null
  error: string | null
}

/** Keyless metadata for a video the user pasted or selected. */
export async function resolveYouTubeVideo(videoId: string, signal?: AbortSignal): Promise<ResolvedYouTubeVideo> {
  const watchUrl = youtubeWatchUrl(videoId)
  try {
    const data = await fetchJson<OEmbedResponse>(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
      { signal, timeoutMs: 8000 }
    )
    return {
      video: {
        id: videoId,
        title: data.title ? decodeHtml(data.title) : `YouTube video ${videoId}`,
        channel: data.author_name ? decodeHtml(data.author_name) : null,
        thumbnailUrl: data.thumbnail_url ?? youtubeThumbnailUrl(videoId),
        url: watchUrl,
        durationMs: null,
        description: null
      },
      error: null
    }
  } catch {
    // oEmbed fails for private/removed videos and offline networks; the id is
    // still playable in the official player, so return a minimal record.
    return {
      video: {
        id: videoId,
        title: `YouTube video ${videoId}`,
        channel: null,
        thumbnailUrl: youtubeThumbnailUrl(videoId),
        url: watchUrl,
        durationMs: null,
        description: null
      },
      error: null
    }
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}
