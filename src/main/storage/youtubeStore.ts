import type { YouTubeVideo } from '@core/youtube'
import { YOUTUBE_ID, youtubeThumbnailUrl, youtubeWatchUrl } from '@core/youtube'
import { JsonFile } from './jsonFile'

export interface YouTubeLibraryState {
  favorites: YouTubeVideo[]
  history: YouTubeVideo[]
}

const HISTORY_LIMIT = 40

/**
 * Favorites and recently played videos, stored by stable video id. Playback
 * URLs are never stored: the player always resolves the id itself.
 */
export class YouTubeStore {
  private readonly file: JsonFile<YouTubeLibraryState>

  constructor(filePath: string) {
    this.file = new JsonFile<YouTubeLibraryState>(filePath, () => ({ favorites: [], history: [] }), sanitize)
  }

  async load(): Promise<void> {
    await this.file.load()
  }

  get state(): YouTubeLibraryState {
    return { favorites: [...this.file.data.favorites], history: [...this.file.data.history] }
  }

  isFavorite(videoId: string): boolean {
    return this.file.data.favorites.some((video) => video.id === videoId)
  }

  toggleFavorite(video: YouTubeVideo): YouTubeLibraryState {
    const exists = this.isFavorite(video.id)
    const favorites = exists
      ? this.file.data.favorites.filter((entry) => entry.id !== video.id)
      : [sanitizeVideo(video), ...this.file.data.favorites].filter((entry): entry is YouTubeVideo => entry !== null)
    this.file.set({ ...this.file.data, favorites: favorites.slice(0, 300) })
    return this.state
  }

  recordHistory(video: YouTubeVideo): YouTubeLibraryState {
    const clean = sanitizeVideo(video)
    if (!clean) return this.state
    const history = [clean, ...this.file.data.history.filter((entry) => entry.id !== clean.id)].slice(0, HISTORY_LIMIT)
    this.file.set({ ...this.file.data, history })
    return this.state
  }

  async flush(): Promise<void> {
    await this.file.flush()
  }
}

function sanitize(raw: unknown): YouTubeLibraryState {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<YouTubeLibraryState>
  return {
    favorites: sanitizeList(source.favorites),
    history: sanitizeList(source.history)
  }
}

function sanitizeList(value: unknown): YouTubeVideo[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const output: YouTubeVideo[] = []
  for (const entry of value) {
    const clean = sanitizeVideo(entry)
    if (!clean || seen.has(clean.id)) continue
    seen.add(clean.id)
    output.push(clean)
  }
  return output.slice(0, 300)
}

function sanitizeVideo(value: unknown): YouTubeVideo | null {
  if (!value || typeof value !== 'object') return null
  const video = value as Partial<YouTubeVideo>
  if (typeof video.id !== 'string' || !YOUTUBE_ID.test(video.id)) return null
  return {
    id: video.id,
    title: typeof video.title === 'string' && video.title.trim() ? video.title.trim().slice(0, 300) : `YouTube video ${video.id}`,
    channel: typeof video.channel === 'string' ? video.channel.slice(0, 200) : null,
    thumbnailUrl: youtubeThumbnailUrl(video.id),
    url: youtubeWatchUrl(video.id),
    durationMs: typeof video.durationMs === 'number' && Number.isFinite(video.durationMs) ? video.durationMs : null,
    description: typeof video.description === 'string' ? video.description.slice(0, 2000) : null
  }
}
