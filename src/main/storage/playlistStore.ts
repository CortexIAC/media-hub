import { randomUUID } from 'node:crypto'
import type { Playlist } from '@core/models'
import type { PlaylistState } from '@shared/ipc'
import { JsonFile } from './jsonFile'

interface PlaylistData {
  version: 1
  playlists: Playlist[]
  favorites: string[]
}

const MAX_NAME = 120

export class PlaylistStore {
  private readonly file: JsonFile<PlaylistData>

  constructor(filePath: string) {
    this.file = new JsonFile<PlaylistData>(
      filePath,
      () => ({ version: 1, playlists: [], favorites: [] }),
      sanitizePlaylistData
    )
  }

  async load(): Promise<void> {
    await this.file.load()
  }

  get paths(): string {
    return this.file.path
  }

  state(): PlaylistState {
    return {
      playlists: this.file.data.playlists.map((playlist) => ({ ...playlist, trackIds: [...playlist.trackIds] })),
      favorites: [...this.file.data.favorites]
    }
  }

  create(name: string, trackIds: string[] = []): Playlist {
    const now = Date.now()
    const playlist: Playlist = {
      id: randomUUID(),
      name: cleanName(name),
      trackIds: unique(trackIds),
      createdAt: now,
      updatedAt: now
    }
    this.file.update((data) => {
      data.playlists.push(playlist)
    })
    return { ...playlist, trackIds: [...playlist.trackIds] }
  }

  rename(id: string, name: string): Playlist {
    const playlist = this.require(id)
    playlist.name = cleanName(name)
    playlist.updatedAt = Date.now()
    this.persist()
    return { ...playlist, trackIds: [...playlist.trackIds] }
  }

  remove(id: string): void {
    this.file.update((data) => {
      data.playlists = data.playlists.filter((playlist) => playlist.id !== id)
    })
  }

  addTracks(id: string, trackIds: string[]): Playlist {
    const playlist = this.require(id)
    const existing = new Set(playlist.trackIds)
    for (const trackId of trackIds) {
      if (typeof trackId === 'string' && trackId && !existing.has(trackId)) {
        playlist.trackIds.push(trackId)
        existing.add(trackId)
      }
    }
    playlist.updatedAt = Date.now()
    this.persist()
    return { ...playlist, trackIds: [...playlist.trackIds] }
  }

  removeTrack(id: string, trackId: string): Playlist {
    const playlist = this.require(id)
    playlist.trackIds = playlist.trackIds.filter((entry) => entry !== trackId)
    playlist.updatedAt = Date.now()
    this.persist()
    return { ...playlist, trackIds: [...playlist.trackIds] }
  }

  reorder(id: string, from: number, to: number): Playlist {
    const playlist = this.require(id)
    if (from < 0 || from >= playlist.trackIds.length) return { ...playlist, trackIds: [...playlist.trackIds] }
    const target = Math.max(0, Math.min(to, playlist.trackIds.length - 1))
    const ids = [...playlist.trackIds]
    const [moved] = ids.splice(from, 1)
    if (moved !== undefined) ids.splice(target, 0, moved)
    playlist.trackIds = ids
    playlist.updatedAt = Date.now()
    this.persist()
    return { ...playlist, trackIds: [...ids] }
  }

  toggleFavorite(trackId: string): boolean {
    if (!trackId) return false
    let favorite = false
    this.file.update((data) => {
      const index = data.favorites.indexOf(trackId)
      if (index === -1) {
        data.favorites.push(trackId)
        favorite = true
      } else {
        data.favorites.splice(index, 1)
        favorite = false
      }
    })
    return favorite
  }

  /** Remove references to tracks that no longer exist. */
  prune(validTrackIds: Set<string>): void {
    this.file.update((data) => {
      data.favorites = data.favorites.filter((id) => validTrackIds.has(id))
      for (const playlist of data.playlists) {
        const filtered = playlist.trackIds.filter((id) => validTrackIds.has(id))
        if (filtered.length !== playlist.trackIds.length) {
          playlist.trackIds = filtered
          playlist.updatedAt = Date.now()
        }
      }
    })
  }

  async flush(): Promise<void> {
    await this.file.flush()
  }

  private require(id: string): Playlist {
    const playlist = this.file.data.playlists.find((entry) => entry.id === id)
    if (!playlist) throw new Error('Playlist not found.')
    return playlist
  }

  private persist(): void {
    this.file.set(this.file.data)
  }
}

function cleanName(name: string): string {
  const trimmed = String(name ?? '').trim().slice(0, MAX_NAME)
  return trimmed.length > 0 ? trimmed : 'Untitled Playlist'
}

function unique(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))]
}

function sanitizePlaylistData(raw: unknown): PlaylistData {
  const defaults: PlaylistData = { version: 1, playlists: [], favorites: [] }
  if (!raw || typeof raw !== 'object') return defaults
  const data = raw as Partial<PlaylistData>
  const playlists = Array.isArray(data.playlists)
    ? data.playlists.filter(isPlaylist).map((playlist) => ({
        ...playlist,
        name: cleanName(playlist.name),
        trackIds: unique(playlist.trackIds)
      }))
    : []
  const favorites = Array.isArray(data.favorites) ? unique(data.favorites) : []
  return { version: 1, playlists, favorites }
}

function isPlaylist(value: unknown): value is Playlist {
  if (!value || typeof value !== 'object') return false
  const playlist = value as Partial<Playlist>
  return (
    typeof playlist.id === 'string' &&
    typeof playlist.name === 'string' &&
    Array.isArray(playlist.trackIds) &&
    playlist.trackIds.every((id) => typeof id === 'string')
  )
}
