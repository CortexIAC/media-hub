import { basename } from 'node:path'
import type { LibraryFolder, LibrarySnapshot, ScanSummary, Track, TrackIssue } from '@core/models'
import { folderIdForPath, hashId, trackIdForPath } from './ids'
import { JsonFile } from './jsonFile'
import { normalizePathKey } from './paths'

export { folderIdForPath, hashId, trackIdForPath }

interface LibraryData {
  version: 1
  folders: LibraryFolder[]
  tracks: Track[]
  lastScan: ScanSummary | null
}

export interface KnownFile {
  id: string
  path: string
  mtimeMs: number
  fileSize: number
}

const ISSUES: readonly TrackIssue[] = ['missing-metadata', 'unreadable', 'missing-file', 'decode-error']

export class LibraryStore {
  private readonly file: JsonFile<LibraryData>
  private byId = new Map<string, Track>()
  private byPathKey = new Map<string, Track>()

  constructor(filePath: string) {
    this.file = new JsonFile<LibraryData>(
      filePath,
      () => ({ version: 1, folders: [], tracks: [], lastScan: null }),
      sanitizeLibraryData
    )
  }

  async load(): Promise<void> {
    await this.file.load()
    this.reindex()
  }

  get paths(): string {
    return this.file.path
  }

  snapshot(): LibrarySnapshot {
    return {
      folders: this.file.data.folders.map((folder) => ({ ...folder })),
      tracks: this.file.data.tracks,
      lastScan: this.file.data.lastScan ? { ...this.file.data.lastScan } : null
    }
  }

  get folders(): LibraryFolder[] {
    return this.file.data.folders.map((folder) => ({ ...folder }))
  }

  getTrack(trackId: string): Track | undefined {
    return this.byId.get(trackId)
  }

  allTrackIds(): string[] {
    return [...this.byId.keys()]
  }

  isTrackInFolder(trackId: string, folderId: string): boolean {
    return this.byId.get(trackId)?.folderId === folderId
  }

  knownFiles(folderId: string): KnownFile[] {
    return this.file.data.tracks
      .filter((track) => track.folderId === folderId)
      .map((track) => ({ id: track.id, path: track.path, mtimeMs: track.mtimeMs, fileSize: track.fileSize }))
  }

  findFolderByPath(folderPath: string): LibraryFolder | undefined {
    const key = normalizePathKey(folderPath)
    return this.file.data.folders.find((folder) => normalizePathKey(folder.path) === key)
  }

  addFolder(folderPath: string): { folder: LibraryFolder; existed: boolean } {
    const existing = this.findFolderByPath(folderPath)
    if (existing) return { folder: { ...existing }, existed: true }
    const folder: LibraryFolder = {
      id: folderIdForPath(folderPath),
      path: folderPath,
      name: basename(folderPath) || folderPath,
      addedAt: Date.now(),
      lastScanAt: null
    }
    this.file.update((data) => {
      data.folders.push(folder)
    })
    return { folder: { ...folder }, existed: false }
  }

  removeFolder(folderId: string): string[] {
    const removedIds = this.file.data.tracks.filter((track) => track.folderId === folderId).map((track) => track.id)
    this.file.update((data) => {
      data.folders = data.folders.filter((folder) => folder.id !== folderId)
      const keep = data.tracks.filter((track) => track.folderId !== folderId)
      data.tracks = keep
    })
    this.reindex()
    return removedIds
  }

  upsertTracks(tracks: Track[]): { added: number; updated: number } {
    if (tracks.length === 0) return { added: 0, updated: 0 }
    let added = 0
    let updated = 0
    this.file.update((data) => {
      const index = new Map(data.tracks.map((track, i) => [track.id, i]))
      for (const track of tracks) {
        const position = index.get(track.id)
        if (position === undefined) {
          index.set(track.id, data.tracks.length)
          data.tracks.push(track)
          added += 1
        } else {
          data.tracks[position] = track
          updated += 1
        }
      }
    })
    this.reindex()
    return { added, updated }
  }

  /** Drop tracks in a folder that the last scan did not find. */
  retainTracks(folderId: string, seenTrackIds: Iterable<string>): number {
    const seen = new Set(seenTrackIds)
    let removed = 0
    this.file.update((data) => {
      const keep = data.tracks.filter((track) => {
        if (track.folderId !== folderId) return true
        if (seen.has(track.id)) return true
        removed += 1
        return false
      })
      data.tracks = keep
    })
    this.reindex()
    return removed
  }

  removeTracks(trackIds: Iterable<string>): number {
    const drop = new Set(trackIds)
    if (drop.size === 0) return 0
    const before = this.file.data.tracks.length
    this.file.update((data) => {
      data.tracks = data.tracks.filter((track) => !drop.has(track.id))
    })
    this.reindex()
    return before - this.file.data.tracks.length
  }

  markFolderScanned(folderId: string, when = Date.now()): void {
    this.file.update((data) => {
      const folder = data.folders.find((entry) => entry.id === folderId)
      if (folder) folder.lastScanAt = when
    })
  }

  setLastScan(summary: ScanSummary | null): void {
    this.file.update((data) => {
      data.lastScan = summary
    })
  }

  get trackCount(): number {
    return this.byId.size
  }

  async flush(): Promise<void> {
    await this.file.flush()
  }

  private reindex(): void {
    this.byId = new Map()
    this.byPathKey = new Map()
    for (const track of this.file.data.tracks) {
      this.byId.set(track.id, track)
      this.byPathKey.set(normalizePathKey(track.path), track)
    }
  }
}

function sanitizeLibraryData(raw: unknown): LibraryData {
  const defaults: LibraryData = { version: 1, folders: [], tracks: [], lastScan: null }
  if (!raw || typeof raw !== 'object') return defaults
  const data = raw as Partial<LibraryData>
  const folders = Array.isArray(data.folders) ? data.folders.filter(isFolder).map((folder) => ({ ...folder })) : []
  const folderIds = new Set(folders.map((folder) => folder.id))
  const seenTrackIds = new Set<string>()
  const tracks = Array.isArray(data.tracks)
    ? data.tracks
        .filter(isTrack)
        .map(sanitizeTrack)
        .filter((track) => {
          if (!folderIds.has(track.folderId) || seenTrackIds.has(track.id)) return false
          seenTrackIds.add(track.id)
          return true
        })
    : []
  return {
    version: 1,
    folders,
    tracks,
    lastScan: isScanSummary(data.lastScan) ? data.lastScan : null
  }
}

function sanitizeTrack(track: Track): Track {
  return {
    ...track,
    title: String(track.title || basename(track.path) || 'Untitled'),
    artist: String(track.artist ?? ''),
    albumArtist: String(track.albumArtist ?? ''),
    album: String(track.album ?? ''),
    durationMs: finite(track.durationMs, 0),
    fileSize: finite(track.fileSize, 0),
    mtimeMs: finite(track.mtimeMs, 0),
    addedAt: finite(track.addedAt, Date.now()),
    updatedAt: finite(track.updatedAt, Date.now()),
    lyrics: typeof track.lyrics === 'string' ? track.lyrics : null,
    lyricsSource:
      track.lyricsSource === 'embedded' || track.lyricsSource === 'sidecar' ? track.lyricsSource : null,
    issues: Array.isArray(track.issues) ? track.issues.filter((issue): issue is TrackIssue => ISSUES.includes(issue)) : []
  }
}

function isFolder(value: unknown): value is LibraryFolder {
  if (!value || typeof value !== 'object') return false
  const folder = value as Partial<LibraryFolder>
  return typeof folder.id === 'string' && typeof folder.path === 'string' && typeof folder.name === 'string'
}

function isTrack(value: unknown): value is Track {
  if (!value || typeof value !== 'object') return false
  const track = value as Partial<Track>
  return (
    typeof track.id === 'string' &&
    typeof track.path === 'string' &&
    typeof track.folderId === 'string' &&
    typeof track.title === 'string'
  )
}

function isScanSummary(value: unknown): value is ScanSummary {
  if (!value || typeof value !== 'object') return false
  const summary = value as Partial<ScanSummary>
  return typeof summary.folderId === 'string' && typeof summary.startedAt === 'number'
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
