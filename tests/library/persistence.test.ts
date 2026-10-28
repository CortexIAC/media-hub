import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type Track } from '@core/models'
import { JsonFile } from '../../src/main/storage/jsonFile'
import { LibraryStore } from '../../src/main/storage/libraryStore'
import { PlaylistStore } from '../../src/main/storage/playlistStore'
import { SessionStore, SettingsStore, sanitizeSession, sanitizeSettings } from '../../src/main/storage/sessionStore'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bunny-store-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function makeTrack(id: string, folderId: string, overrides: Partial<Track> = {}): Track {
  return {
    id,
    path: `C:/music/${folderId}/${id}.mp3`,
    folderId,
    title: `Track ${id}`,
    artist: 'Artist',
    albumArtist: 'Artist',
    album: 'Album',
    trackNo: 1,
    discNo: 1,
    year: 2020,
    genre: 'Test',
    durationMs: 1000,
    codec: 'MPEG 1 Layer 3',
    container: 'MPEG',
    bitrate: 320000,
    sampleRate: 44100,
    channels: 2,
    lossless: false,
    artworkId: null,
    lyrics: null,
    lyricsSource: null,
    fileSize: 10,
    mtimeMs: 1,
    addedAt: 1,
    updatedAt: 1,
    issues: [],
    ...overrides
  }
}

describe('JsonFile', () => {
  it('writes atomically and reloads the value', async () => {
    const path = join(dir, 'values.json')
    const file = new JsonFile<{ count: number }>(path, () => ({ count: 0 }), (raw) => ({
      count: typeof (raw as { count?: unknown })?.count === 'number' ? (raw as { count: number }).count : 0
    }))
    await file.load()
    expect(file.data.count).toBe(0)
    file.set({ count: 7 })
    await file.flush()
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ count: 7 })
    expect(await readdir(dir)).toEqual(['values.json'])

    const reloaded = new JsonFile<{ count: number }>(path, () => ({ count: 0 }), (raw) => ({
      count: typeof (raw as { count?: unknown })?.count === 'number' ? (raw as { count: number }).count : 0
    }))
    await reloaded.load()
    expect(reloaded.data.count).toBe(7)
  })

  it('quarantines a corrupt file and falls back to defaults', async () => {
    const path = join(dir, 'broken.json')
    await writeFile(path, '{ this is not json', 'utf8')
    const file = new JsonFile<{ ok: boolean }>(path, () => ({ ok: false }), () => ({ ok: false }))
    await file.load()
    expect(file.data).toEqual({ ok: false })
    const files = await readdir(dir)
    expect(files.some((name) => name.startsWith(`${basename(path)}.corrupt-`))).toBe(true)
  })

  it('uses defaults when the file is missing', async () => {
    const file = new JsonFile<string[]>(join(dir, 'missing.json'), () => ['default'], () => ['default'])
    await file.load()
    expect(file.data).toEqual(['default'])
  })
})

describe('LibraryStore', () => {
  it('adds folders once and keeps the id stable', async () => {
    const store = new LibraryStore(join(dir, 'library.json'))
    await store.load()
    const first = store.addFolder('C:\\Music\\Albums')
    const second = store.addFolder('C:\\Music\\Albums')
    expect(second.existed).toBe(true)
    expect(second.folder.id).toBe(first.folder.id)
    expect(store.folders).toHaveLength(1)
    expect(store.folders[0]?.name).toBe('Albums')
  })

  it('upserts, updates and retains tracks for a folder', async () => {
    const store = new LibraryStore(join(dir, 'library.json'))
    await store.load()
    const folder = store.addFolder('C:\\Music\\A').folder

    expect(store.upsertTracks([makeTrack('a', folder.id), makeTrack('b', folder.id)])).toEqual({ added: 2, updated: 0 })
    expect(store.trackCount).toBe(2)

    expect(store.upsertTracks([makeTrack('a', folder.id, { title: 'Renamed' })])).toEqual({ added: 0, updated: 1 })
    expect(store.getTrack('a')?.title).toBe('Renamed')

    expect(store.retainTracks(folder.id, ['a'])).toBe(1)
    expect(store.trackCount).toBe(1)
    expect(store.getTrack('b')).toBeUndefined()
  })

  it('removes a folder with its tracks and persists across reloads', async () => {
    const path = join(dir, 'library.json')
    const store = new LibraryStore(path)
    await store.load()
    const folder = store.addFolder('C:\\Music\\A').folder
    store.upsertTracks([makeTrack('a', folder.id), makeTrack('b', folder.id)])
    await store.flush()

    const reloaded = new LibraryStore(path)
    await reloaded.load()
    expect(reloaded.snapshot().tracks).toHaveLength(2)

    const removed = reloaded.removeFolder(folder.id)
    expect(removed.sort()).toEqual(['a', 'b'])
    expect(reloaded.snapshot().tracks).toEqual([])
    expect(reloaded.snapshot().folders).toEqual([])
    await reloaded.flush()

    const empty = new LibraryStore(path)
    await empty.load()
    expect(empty.trackCount).toBe(0)
  })

  it('drops corrupt or orphaned entries instead of failing to start', async () => {
    const path = join(dir, 'library.json')
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        folders: [{ id: 'f1', path: 'C:/Music', name: 'Music', addedAt: 1, lastScanAt: null }],
        tracks: [
          makeTrack('good', 'f1'),
          makeTrack('duplicate', 'f1'),
          makeTrack('duplicate', 'f1'),
          { ...makeTrack('orphan', 'missing-folder') },
          { id: 'broken', path: 'C:/Music/broken.mp3', folderId: 'f1' }
        ],
        lastScan: null
      }),
      'utf8'
    )
    const store = new LibraryStore(path)
    await store.load()
    expect(store.snapshot().tracks.map((track) => track.id).sort()).toEqual(['duplicate', 'good'])
  })

  it('records the last scan summary and folder scan time', async () => {
    const store = new LibraryStore(join(dir, 'library.json'))
    await store.load()
    const folder = store.addFolder('C:\\Music\\A').folder
    store.markFolderScanned(folder.id, 1234)
    expect(store.folders[0]?.lastScanAt).toBe(1234)

    store.setLastScan({
      folderId: folder.id,
      folderPath: folder.path,
      startedAt: 1,
      finishedAt: 2,
      filesSeen: 3,
      tracksAdded: 1,
      tracksUpdated: 0,
      tracksUnchanged: 2,
      tracksRemoved: 0,
      failures: [],
      skipped: [],
      cancelled: false,
      truncated: false
    })
    expect(store.snapshot().lastScan?.filesSeen).toBe(3)
  })
})

describe('PlaylistStore', () => {
  it('creates, edits, reorders and persists playlists', async () => {
    const path = join(dir, 'playlists.json')
    const store = new PlaylistStore(path)
    await store.load()

    const playlist = store.create('  Late Night  ', ['a', 'b', 'a'])
    expect(playlist.name).toBe('Late Night')
    expect(playlist.trackIds).toEqual(['a', 'b'])
    expect(store.create('   ').name).toBe('Untitled Playlist')

    store.addTracks(playlist.id, ['c', 'b'])
    expect(store.state().playlists[0]?.trackIds).toEqual(['a', 'b', 'c'])

    store.reorder(playlist.id, 0, 2)
    expect(store.state().playlists[0]?.trackIds).toEqual(['b', 'c', 'a'])

    store.removeTrack(playlist.id, 'c')
    expect(store.state().playlists[0]?.trackIds).toEqual(['b', 'a'])

    store.rename(playlist.id, 'Early Morning')
    expect(store.state().playlists[0]?.name).toBe('Early Morning')

    await store.flush()
    const reloaded = new PlaylistStore(path)
    await reloaded.load()
    expect(reloaded.state().playlists[0]?.name).toBe('Early Morning')
    expect(reloaded.state().playlists[0]?.trackIds).toEqual(['b', 'a'])
  })

  it('toggles favorites and prunes missing tracks', async () => {
    const store = new PlaylistStore(join(dir, 'playlists.json'))
    await store.load()
    const playlist = store.create('Mix', ['a', 'b', 'c'])

    expect(store.toggleFavorite('a')).toBe(true)
    expect(store.toggleFavorite('a')).toBe(false)
    expect(store.toggleFavorite('b')).toBe(true)

    store.prune(new Set(['b', 'c']))
    expect(store.state().favorites).toEqual(['b'])
    expect(store.state().playlists.find((entry) => entry.id === playlist.id)?.trackIds).toEqual(['b', 'c'])
  })

  it('throws a clear error for unknown playlists', async () => {
    const store = new PlaylistStore(join(dir, 'playlists.json'))
    await store.load()
    expect(() => store.rename('missing', 'Name')).toThrow(/not found/i)
  })
})

describe('settings and session persistence', () => {
  it('sanitises invalid settings', () => {
    expect(sanitizeSettings({ volume: 5 }).volume).toBe(1)
    expect(sanitizeSettings({ volume: -2 }).volume).toBe(0)
    expect(sanitizeSettings({ repeat: 'sideways' }).repeat).toBe('off')
    expect(sanitizeSettings({ accent: 'chartreuse' }).accent).toBe(DEFAULT_SETTINGS.accent)
    expect(sanitizeSettings({ accent: '#112233' }).accent).toBe('#112233')
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS)
  })

  it('sanitises the equalizer and the optional YouTube key', () => {
    const clamped = sanitizeSettings({
      equalizer: { enabled: true, bands: [99, -99, 3, Number.NaN, 2.26] }
    })
    expect(clamped.equalizer.enabled).toBe(true)
    expect(clamped.equalizer.bands).toEqual([12, -12, 3, 0, 2.3])
    expect(clamped.equalizer.boost).toBe(1)
    expect(clamped.equalizer.bassBoost).toBe(0)

    const boosted = sanitizeSettings({ equalizer: { boost: 9, bassBoost: 40 } })
    expect(boosted.equalizer.boost).toBe(3)
    expect(boosted.equalizer.bassBoost).toBe(12)
    expect(sanitizeSettings({ equalizer: { boost: 0.2 } }).equalizer.boost).toBe(1)

    expect(sanitizeSettings({ equalizer: { bands: 'loud' } }).equalizer).toEqual(DEFAULT_SETTINGS.equalizer)
    expect(sanitizeSettings({ youtubeApiKey: '  abc123  ' }).youtubeApiKey).toBe('abc123')
    expect(sanitizeSettings({ youtubeApiKey: 42 as unknown as string }).youtubeApiKey).toBe('')
  })

  it('stores settings and restores them', async () => {
    const path = join(dir, 'settings.json')
    const store = new SettingsStore(path)
    await store.load()
    const next = store.update({ volume: 0.25, shuffle: true, repeat: 'all' })
    expect(next.volume).toBe(0.25)
    await store.flush()

    const reloaded = new SettingsStore(path)
    await reloaded.load()
    expect(reloaded.value.shuffle).toBe(true)
    expect(reloaded.value.repeat).toBe('all')
  })

  it('sanitises playback sessions', () => {
    expect(sanitizeSession(null)).toBeNull()
    expect(sanitizeSession({ queueIds: [] })).toBeNull()
    const session = sanitizeSession({
      trackId: 'zzz',
      queueIds: ['a', 'b'],
      queueIndex: 99,
      positionMs: -5,
      updatedAt: 10
    })
    expect(session).toEqual({ trackId: null, queueIds: ['a', 'b'], queueIndex: 1, positionMs: 0, updatedAt: 10 })
  })

  it('persists the last session', async () => {
    const path = join(dir, 'session.json')
    const store = new SessionStore(path)
    await store.load()
    expect(store.value).toBeNull()
    store.save({ trackId: 'a', queueIds: ['a', 'b'], queueIndex: 0, positionMs: 1234, updatedAt: 5 })
    await store.flush()

    const reloaded = new SessionStore(path)
    await reloaded.load()
    expect(reloaded.value?.positionMs).toBe(1234)
    expect(reloaded.value?.queueIds).toEqual(['a', 'b'])
  })
})
