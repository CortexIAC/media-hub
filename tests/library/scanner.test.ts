import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readTrack, walkAudioFolder } from '../../src/main/library/scanner.core'
import { createFixtureLibrary, type FixtureLibrary } from '../helpers/audio-fixtures'

let fixtures: FixtureLibrary
let artworkDir: string

beforeEach(async () => {
  fixtures = await createFixtureLibrary()
  artworkDir = join(fixtures.root, '.artwork-cache')
})

afterEach(async () => {
  await fs.rm(fixtures.root, { recursive: true, force: true })
})

describe('walkAudioFolder', () => {
  it('finds supported audio recursively and skips hidden folders', async () => {
    const result = await walkAudioFolder(fixtures.root)
    expect(result.cancelled).toBe(false)
    expect(result.truncated).toBe(false)
    // Eight playable files (WAV, MP3 and FLAC) plus the two deliberately broken
    // ones (corrupt.m4a, empty.wav), which are discovered but flagged unreadable.
    expect(result.files).toHaveLength(10)
    const names = result.files.map((file) => file.path.split(/[\\/]/).pop())
    expect(names).toContain('01 Opening Tone.wav')
    expect(names).toContain('01 Cover Tone.mp3')
    expect(names).toContain('04 Lossless Field.flac')
    expect(names).toContain('corrupt.m4a')
    expect(names).not.toContain('should-not-scan.wav')
  })

  it('reports recognised-but-unsupported audio instead of hiding it', async () => {
    const result = await walkAudioFolder(fixtures.root)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0]?.extension).toBe('.wma')
  })

  it('ignores non-audio files', async () => {
    const result = await walkAudioFolder(fixtures.root)
    expect(result.files.some((file) => file.path.endsWith('.txt'))).toBe(false)
  })

  it('truncates at the file limit and says so', async () => {
    const result = await walkAudioFolder(fixtures.root, { maxFiles: 2 })
    expect(result.files).toHaveLength(2)
    expect(result.truncated).toBe(true)
  })

  it('honours cancellation', async () => {
    const result = await walkAudioFolder(fixtures.root, { isCancelled: () => true })
    expect(result.cancelled).toBe(true)
    expect(result.files).toHaveLength(0)
  })

  it('records unreadable roots without throwing', async () => {
    const result = await walkAudioFolder(join(fixtures.root, 'does-not-exist'))
    expect(result.files).toEqual([])
    expect(result.failures.length).toBe(1)
  })

  it('returns an empty result for an empty folder', async () => {
    const empty = join(fixtures.root, 'empty-folder')
    await fs.mkdir(empty, { recursive: true })
    const result = await walkAudioFolder(empty)
    expect(result.files).toEqual([])
    expect(result.failures).toEqual([])
  })
})

describe('readTrack', () => {
  it('reads WAV tags, duration and technical details', async () => {
    const stat = await fs.stat(fixtures.taggedWav)
    const { track, failure } = await readTrack(
      { path: fixtures.taggedWav, mtimeMs: stat.mtimeMs, fileSize: stat.size },
      { folderId: 'folder-one', artworkDir }
    )
    expect(failure).toBeNull()
    expect(track.title).toBe('Opening Tone')
    expect(track.artist).toBe('Bunny Test Ensemble')
    expect(track.album).toBe('Signal Garden')
    expect(track.trackNo).toBe(1)
    expect(track.durationMs).toBeGreaterThan(7400)
    expect(track.durationMs).toBeLessThan(8600)
    expect(track.codec?.toLowerCase()).toContain('pcm')
    expect(track.sampleRate).toBe(44_100)
    expect(track.channels).toBe(1)
    expect(track.issues).toEqual([])
  })

  it('falls back to the file name when tags are missing', async () => {
    const stat = await fs.stat(fixtures.untaggedWav)
    const { track } = await readTrack(
      { path: fixtures.untaggedWav, mtimeMs: stat.mtimeMs, fileSize: stat.size },
      { folderId: 'folder-one', artworkDir }
    )
    expect(track.title).toBe('02 untagged tone')
    expect(track.artist).toBe('')
    expect(track.issues).toContain('missing-metadata')
    expect(track.durationMs).toBeGreaterThan(5500)
  })

  it('reads FLAC Vorbis comments and reports a lossless stream', async () => {
    const stat = await fs.stat(fixtures.losslessFlac)
    const { track, failure } = await readTrack(
      { path: fixtures.losslessFlac, mtimeMs: stat.mtimeMs, fileSize: stat.size },
      { folderId: 'folder-three', artworkDir }
    )
    expect(failure).toBeNull()
    expect(track.title).toBe('Lossless Field')
    expect(track.artist).toBe('Neon Cartography')
    expect(track.album).toBe('Night Drive')
    expect(track.trackNo).toBe(4)
    expect(track.year).toBe(2024)
    expect(track.genre).toBe('Synthwave')
    expect(track.lossless).toBe(true)
    expect(track.codec?.toLowerCase()).toContain('flac')
    expect(track.durationMs).toBeGreaterThan(8000)
    expect(track.durationMs).toBeLessThan(10_000)
    expect(track.issues).toEqual([])
  })

  it('reads MP3 tags and caches embedded artwork', async () => {
    const stat = await fs.stat(fixtures.taggedMp3)
    const { track, failure } = await readTrack(
      { path: fixtures.taggedMp3, mtimeMs: stat.mtimeMs, fileSize: stat.size },
      { folderId: 'folder-two', artworkDir }
    )
    expect(failure).toBeNull()
    expect(track.title).toBe('Cover Tone')
    expect(track.artist).toBe('Bunny Test Ensemble')
    expect(track.album).toBe('Artwork Sessions')
    expect(track.trackNo).toBe(1)
    expect(track.year).toBe(2021)
    expect(track.lossless).toBe(false)
    expect(track.artworkId).toMatch(/^[a-f0-9]{40}\.png$/)

    const artworkFile = await fs.readFile(join(artworkDir, track.artworkId as string))
    expect(artworkFile.length).toBeGreaterThan(100)
    expect(artworkFile.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  })

  it('deduplicates identical artwork across tracks', async () => {
    const [first, second] = await Promise.all([
      fs.stat(fixtures.taggedMp3),
      fs.stat(fixtures.secondMp3)
    ])
    const a = await readTrack(
      { path: fixtures.taggedMp3, mtimeMs: first.mtimeMs, fileSize: first.size },
      { folderId: 'folder-two', artworkDir }
    )
    const b = await readTrack(
      { path: fixtures.secondMp3, mtimeMs: second.mtimeMs, fileSize: second.size },
      { folderId: 'folder-two', artworkDir }
    )
    expect(a.track.artworkId).not.toBeNull()
    expect(a.track.artworkId).toBe(b.track.artworkId)
    const files = await fs.readdir(artworkDir)
    expect(files.filter((name) => name === a.track.artworkId)).toHaveLength(1)
  })

  it('flags corrupt files instead of crashing', async () => {
    const corrupt = join(fixtures.broken, 'corrupt.m4a')
    const stat = await fs.stat(corrupt)
    const { track, failure } = await readTrack(
      { path: corrupt, mtimeMs: stat.mtimeMs, fileSize: stat.size },
      { folderId: 'folder-broken', artworkDir }
    )
    expect(failure).not.toBeNull()
    expect(track.issues).toContain('unreadable')
    expect(track.title).toBe('corrupt')
    expect(track.durationMs).toBe(0)
  })

  it('flags empty files', async () => {
    const empty = join(fixtures.broken, 'empty.wav')
    const stat = await fs.stat(empty)
    const { track } = await readTrack(
      { path: empty, mtimeMs: stat.mtimeMs, fileSize: stat.size },
      { folderId: 'folder-broken', artworkDir }
    )
    expect(track.issues).toContain('unreadable')
  })
})
