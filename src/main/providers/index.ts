import type {
  DiscoveryKind,
  DiscoveryResponse,
  DiscoveryResult,
  DiscoverySource,
  DiscoverySourceError
} from '@core/discovery'
import { dedupeDiscoveryResults, normalizeDiscoveryQuery } from '@core/discovery'
import {
  searchArchiveAudio,
  searchArchiveVideo,
  searchGutenberg,
  searchLibrivox,
  searchOpenLibrary
} from './catalogues'
import { searchYouTubeVideos } from './youtube'

/**
 * Fan-out search across the public catalogues.
 *
 * A failing catalogue never fails the whole search: each source is settled
 * independently and reported in `errors`, so the UI can say "Open Library is
 * unavailable" while still showing Gutenberg results.
 */

export interface DiscoverOptions {
  kinds?: DiscoveryKind[]
  limit?: number
  youtubeApiKey?: string
  signal?: AbortSignal
}

interface Task {
  source: DiscoverySource
  run: () => Promise<DiscoveryResult[]>
}

export async function searchCatalogues(rawQuery: string, options: DiscoverOptions = {}): Promise<DiscoveryResponse> {
  const query = normalizeDiscoveryQuery(rawQuery)
  if (query.length < 2) {
    return { query, results: [], errors: [], searched: [] }
  }

  const limit = Math.min(25, Math.max(5, options.limit ?? 15))
  const kinds = options.kinds && options.kinds.length > 0 ? new Set<DiscoveryKind>(options.kinds) : null
  const wants = (kind: DiscoveryKind): boolean => !kinds || kinds.has(kind)

  const tasks: Task[] = []
  if (wants('book')) {
    tasks.push({ source: 'openlibrary', run: () => searchOpenLibrary(query, limit, options.signal) })
    tasks.push({ source: 'gutenberg', run: () => searchGutenberg(query, limit, options.signal) })
  }
  if (wants('audiobook')) {
    tasks.push({ source: 'librivox', run: () => searchLibrivox(query, limit, options.signal) })
  }
  if (wants('music') || wants('video')) {
    tasks.push({
      source: 'archive',
      run: async () => {
        const [audio, video] = await Promise.all([
          wants('music') ? searchArchiveAudio(query, limit, options.signal) : Promise.resolve([]),
          wants('video') ? searchArchiveVideo(query, limit, options.signal) : Promise.resolve([])
        ])
        return [...audio, ...video]
      }
    })
  }
  if (wants('video') || wants('music')) {
    const key = options.youtubeApiKey?.trim()
    if (key) {
      tasks.push({
        source: 'youtube',
        run: async () => {
          const videos = await searchYouTubeVideos(query, key, limit, options.signal)
          return videos.map<DiscoveryResult>((video) => ({
            id: video.id,
            source: 'youtube',
            kind: 'video',
            title: video.title,
            creator: video.channel,
            year: null,
            description: null,
            detailUrl: video.url,
            accessUrl: null,
            accessKind: 'external',
            accessLabel: 'Open in Video',
            rights: 'Playback only inside YouTube’s own player'
          }))
        }
      })
    }
  }

  const settled = await Promise.allSettled(tasks.map((task) => task.run()))
  const results: DiscoveryResult[] = []
  const errors: DiscoverySourceError[] = []

  settled.forEach((outcome, index) => {
    const task = tasks[index]
    if (!task) return
    if (outcome.status === 'fulfilled') results.push(...outcome.value)
    else {
      errors.push({
        source: task.source,
        message: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
      })
    }
  })

  return {
    query,
    results: dedupeDiscoveryResults(results),
    errors,
    searched: tasks.map((task) => task.source)
  }
}
