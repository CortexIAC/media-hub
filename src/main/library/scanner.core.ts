import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { parseFile } from 'music-metadata'
import {
  baseName,
  extensionOf,
  isKnownUnsupportedAudioExtension,
  isSupportedAudioExtension,
  type SkippedFile,
  type Track,
  type TrackIssue
} from '@core/models'
import { trackIdForPath } from '../storage/ids'

export interface FoundFile {
  path: string
  mtimeMs: number
  fileSize: number
}

export interface WalkOptions {
  maxFiles?: number
  maxDepth?: number
  isCancelled?: () => boolean
  onProgress?: (filesSeen: number, currentFile: string | null) => void
  /** Injected for tests so directory order is deterministic. */
  readdir?: (dir: string) => Promise<Array<{ name: string; isDirectory: boolean; isSymbolicLink: boolean }>>
}

export interface WalkResult {
  files: FoundFile[]
  skipped: SkippedFile[]
  failures: Array<{ path: string; message: string }>
  filesSeen: number
  truncated: boolean
  cancelled: boolean
}

const IGNORED_DIRECTORIES = new Set([
  '$recycle.bin',
  'system volume information',
  'node_modules',
  '.git',
  '.svn',
  '__macosx',
  'lost+found'
])

export async function walkAudioFolder(root: string, options: WalkOptions = {}): Promise<WalkResult> {
  const maxFiles = options.maxFiles ?? 30_000
  const maxDepth = options.maxDepth ?? 24
  const readdir = options.readdir ?? defaultReaddir
  const files: FoundFile[] = []
  const skipped: SkippedFile[] = []
  const failures: Array<{ path: string; message: string }> = []
  let filesSeen = 0
  let truncated = false
  let cancelled = false

  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }]

  while (stack.length > 0) {
    if (options.isCancelled?.()) {
      cancelled = true
      break
    }
    const next = stack.pop()
    if (!next) break

    let entries: Array<{ name: string; isDirectory: boolean; isSymbolicLink: boolean }>
    try {
      entries = await readdir(next.dir)
    } catch (error) {
      failures.push({ path: next.dir, message: messageOf(error) })
      continue
    }

    entries.sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      if (options.isCancelled?.()) {
        cancelled = true
        break
      }
      if (entry.isSymbolicLink) continue
      const fullPath = join(next.dir, entry.name)

      if (entry.isDirectory) {
        if (next.depth >= maxDepth) continue
        if (IGNORED_DIRECTORIES.has(entry.name.toLowerCase())) continue
        if (entry.name.startsWith('.')) continue
        stack.push({ dir: fullPath, depth: next.depth + 1 })
        continue
      }

      const extension = extensionOf(entry.name)
      if (!extension) continue

      if (isKnownUnsupportedAudioExtension(extension)) {
        if (skipped.length < 500) skipped.push({ path: fullPath, extension, reason: 'unsupported-format' })
        filesSeen += 1
        options.onProgress?.(filesSeen, fullPath)
        continue
      }
      if (!isSupportedAudioExtension(extension)) continue

      if (files.length >= maxFiles) {
        truncated = true
        continue
      }

      try {
        const stat = await fs.stat(fullPath)
        if (!stat.isFile()) continue
        files.push({ path: fullPath, mtimeMs: stat.mtimeMs, fileSize: stat.size })
      } catch (error) {
        failures.push({ path: fullPath, message: messageOf(error) })
      }
      filesSeen += 1
      options.onProgress?.(filesSeen, fullPath)
    }
    if (cancelled) break
  }

  return { files, skipped, failures, filesSeen, truncated, cancelled }
}

async function defaultReaddir(dir: string) {
  const handle = await fs.opendir(dir)
  const entries: Array<{ name: string; isDirectory: boolean; isSymbolicLink: boolean }> = []
  try {
    for await (const entry of handle) {
      entries.push({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isSymbolicLink: entry.isSymbolicLink()
      })
    }
  } finally {
    await handle.close().catch(() => undefined)
  }
  return entries
}

export interface ReadTrackOptions {
  folderId: string
  artworkDir: string
  now?: number
}

export interface ReadTrackResult {
  track: Track
  failure: { path: string; message: string } | null
}

const MAX_ARTWORK_BYTES = 12 * 1024 * 1024

/**
 * Read metadata for one file. Never throws: an unreadable file still produces a
 * track record flagged with `unreadable`, so the UI can show what is wrong.
 */
export async function readTrack(file: FoundFile, options: ReadTrackOptions): Promise<ReadTrackResult> {
  const now = options.now ?? Date.now()
  const fallback: Track = {
    id: trackIdForPath(file.path),
    path: file.path,
    folderId: options.folderId,
    title: baseName(file.path) || 'Untitled',
    artist: '',
    albumArtist: '',
    album: '',
    trackNo: null,
    discNo: null,
    year: null,
    genre: null,
    durationMs: 0,
    codec: null,
    container: extensionOf(file.path).replace('.', '') || null,
    bitrate: null,
    sampleRate: null,
    channels: null,
    lossless: false,
    artworkId: null,
    fileSize: file.fileSize,
    mtimeMs: file.mtimeMs,
    addedAt: now,
    updatedAt: now,
    issues: []
  }

  try {
    const metadata = await parseFile(file.path, { duration: true })
    const common = metadata.common
    const format = metadata.format
    const title = common.title?.trim()
    const issues: TrackIssue[] = []
    if (!title) issues.push('missing-metadata')

    const artworkId = await cacheArtwork(common.picture, options.artworkDir)
    const durationMs = typeof format.duration === 'number' && Number.isFinite(format.duration) ? Math.round(format.duration * 1000) : 0

    return {
      track: {
        ...fallback,
        title: title || fallback.title,
        artist: common.artist?.trim() ?? '',
        albumArtist: common.albumartist?.trim() ?? '',
        album: common.album?.trim() ?? '',
        trackNo: common.track?.no ?? null,
        discNo: common.disk?.no ?? null,
        year: common.year ?? null,
        genre: common.genre?.[0]?.trim() ?? null,
        durationMs,
        codec: format.codec ?? null,
        container: format.container ?? fallback.container,
        bitrate: format.bitrate ?? null,
        sampleRate: format.sampleRate ?? null,
        channels: format.numberOfChannels ?? null,
        lossless: Boolean(format.lossless),
        artworkId,
        issues
      },
      failure: null
    }
  } catch (error) {
    return {
      track: { ...fallback, issues: ['unreadable'] },
      failure: { path: file.path, message: messageOf(error) }
    }
  }
}

export function artworkIdFor(data: Uint8Array, mime: string | undefined): string | null {
  const extension = mimeToExtension(mime)
  if (!extension) return null
  return `${createHash('sha1').update(Buffer.from(data)).digest('hex')}.${extension}`
}

async function cacheArtwork(
  pictures: ReadonlyArray<{ data: Uint8Array; format?: string }> | undefined,
  artworkDir: string
): Promise<string | null> {
  const picture = pictures?.[0]
  if (!picture || picture.data.length === 0 || picture.data.length > MAX_ARTWORK_BYTES) return null
  const artworkId = artworkIdFor(picture.data, picture.format)
  if (!artworkId) return null
  await fs.mkdir(artworkDir, { recursive: true })
  const target = join(artworkDir, artworkId)
  try {
    await fs.writeFile(target, picture.data, { flag: 'wx' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      console.warn(`[scanner] could not cache artwork: ${messageOf(error)}`)
      return null
    }
  }
  return artworkId
}

function mimeToExtension(mime: string | undefined): string | null {
  switch ((mime ?? '').toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
    case 'jpg':
      return 'jpg'
    case 'image/png':
    case 'png':
      return 'png'
    case 'image/webp':
    case 'webp':
      return 'webp'
    case 'image/gif':
    case 'gif':
      return 'gif'
    case 'image/bmp':
    case 'bmp':
      return 'bmp'
    default:
      return null
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code
    return code ? `${code}: ${error.message}` : error.message
  }
  return String(error)
}
