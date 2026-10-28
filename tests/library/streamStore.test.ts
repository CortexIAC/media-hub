import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { seedSources } from '@core/streamSeeds'
import { streamIdFor } from '@core/streams'
import { StreamStore } from '../../src/main/storage/streamStore'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bunny-streams-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

async function open(): Promise<StreamStore> {
  const store = new StreamStore(join(dir, 'streams.json'))
  await store.load()
  return store
}

describe('StreamStore', () => {
  it('starts empty and unseeded', async () => {
    const store = await open()
    expect(store.sources).toEqual([])
    expect(store.seededAt).toBeNull()
  })

  it('seeds the bundled suggestions once and remembers that it did', async () => {
    const store = await open()
    expect(store.seed(seedSources(), 1_700_000_000_000)).toBe(seedSources().length)
    expect(store.seededAt).toBe(1_700_000_000_000)
    await store.flush()

    const reopened = await open()
    expect(reopened.sources).toHaveLength(seedSources().length)
    expect(reopened.seededAt).toBe(1_700_000_000_000)
    // Seeding again adds nothing: the ids already exist.
    expect(reopened.seed(seedSources(), 1_700_000_100_000)).toBe(0)
  })

  it('keeps a deleted suggestion deleted across a reload', async () => {
    const store = await open()
    store.seed(seedSources(), 1)
    const [first] = store.sources
    expect(first).toBeDefined()
    expect(store.remove(first!.id)).toBe(true)
    await store.flush()

    const reopened = await open()
    expect(reopened.sources.some((source) => source.id === first!.id)).toBe(false)
    expect(reopened.seededAt).toBe(1)
  })

  it('deduplicates by url so pasting the same link twice is a no-op', async () => {
    const store = await open()
    const url = 'https://example.com/live.m3u8'
    const added = store.add([
      { id: streamIdFor(url), name: 'Live', url, group: null, logoUrl: null, kind: 'hls', addedAt: 1, lastPlayedAt: null },
      { id: streamIdFor(url), name: 'Live again', url, group: null, logoUrl: null, kind: 'hls', addedAt: 2, lastPlayedAt: null }
    ])
    expect(added.added).toHaveLength(1)
    expect(added.skipped).toBe(1)
  })

  it('renames and marks playback without losing other fields', async () => {
    const store = await open()
    store.seed(seedSources(), 5)
    const target = store.sources[0]!
    expect(store.rename(target.id, '  My station  ')?.name).toBe('My station')
    store.markPlayed(target.id, 42)
    const updated = store.get(target.id)
    expect(updated?.name).toBe('My station')
    expect(updated?.lastPlayedAt).toBe(42)
    expect(updated?.url).toBe(target.url)
    expect(store.rename(target.id, '   ')).toBeNull()
  })

  it('keeps the seeded marker but drops unusable entries from a corrupt-looking file', async () => {
    const file = join(dir, 'streams.json')
    await writeFile(
      file,
      JSON.stringify({
        seededAt: 99,
        sources: [
          { url: 'magnet:?xt=urn:btih:abc', name: 'Nope' },
          { url: 'https://example.com/a.mp4', name: 'Kept' },
          { url: 'https://example.com/a.mp4', name: 'Duplicate' }
        ]
      }),
      'utf8'
    )
    const store = await open()
    expect(store.seededAt).toBe(99)
    expect(store.sources).toHaveLength(1)
    expect(store.sources[0]?.name).toBe('Kept')

    await store.flush()
    const written = JSON.parse(await readFile(file, 'utf8')) as { seededAt: number }
    expect(written.seededAt).toBe(99)
  })
})
