import { classifyStream, streamIdFor, type StreamSource } from './streams'

/**
 * Streams offered on first launch.
 *
 * Every entry is a link the operator publishes for public listening or viewing:
 * public radio (SomaFM, Radio Paradise, Radio Swiss Classic), NASA's public live
 * stream, and public-domain film and audiobooks hosted by the Internet Archive.
 * Nothing here is a catalogue of copyrighted media, an IPTV list of unknown
 * provenance, or an indexer endpoint — those are deliberately out of scope and
 * documented as such in docs/PROVIDER-FEASIBILITY.md.
 *
 * All URLs were checked before being added and are re-checked by
 * `scripts/check-streams.mjs` on every run. A seed that dies is removed rather
 * than left to fail for the user.
 */
export interface StreamSeed {
  name: string
  url: string
  group: string
}

export const STREAM_SEEDS: readonly StreamSeed[] = [
  {
    name: 'Groove Salad',
    url: 'https://ice1.somafm.com/groovesalad-128-mp3',
    group: 'Public radio'
  },
  {
    name: 'Drone Zone',
    url: 'https://ice1.somafm.com/dronezone-128-mp3',
    group: 'Public radio'
  },
  {
    name: 'Indie Pop Rocks',
    url: 'https://ice1.somafm.com/indiepop-128-mp3',
    group: 'Public radio'
  },
  {
    name: 'Secret Agent',
    url: 'https://ice1.somafm.com/secretagent-128-mp3',
    group: 'Public radio'
  },
  {
    name: 'Radio Paradise — Main Mix',
    url: 'https://stream.radioparadise.com/mp3-192',
    group: 'Public radio'
  },
  {
    name: 'Radio Paradise — Mellow Mix',
    url: 'https://stream.radioparadise.com/mellow-192',
    group: 'Public radio'
  },
  {
    name: 'Radio Swiss Classic',
    url: 'https://stream.srg-ssr.ch/m/rsc_de/mp3_128',
    group: 'Public radio'
  },
  {
    name: 'NASA TV',
    url: 'https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8',
    group: 'Public live TV'
  },
  {
    name: 'Nosferatu (1922)',
    url: 'https://archive.org/download/nosferatu_1929/nosferatu_1929.ia.mp4',
    group: 'Public domain film'
  },
  {
    name: 'Big Buck Bunny',
    url: 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4',
    group: 'Public domain film'
  },
  {
    name: 'Pride and Prejudice — LibriVox',
    url: 'https://archive.org/download/solo_pride_librivox/prideandprejudice_01-04_austen_apc_64kb.mp3',
    group: 'Public domain audiobooks'
  }
]

/** Seeds as stored sources, ready for `StreamStore.add`. */
export function seedSources(now = Date.now()): StreamSource[] {
  return STREAM_SEEDS.map((seed) => ({
    id: streamIdFor(seed.url),
    name: seed.name,
    url: seed.url,
    group: seed.group,
    logoUrl: null,
    kind: classifyStream(seed.url).kind,
    addedAt: now,
    lastPlayedAt: null
  }))
}

/** How many seeds are not in the saved list yet. */
export function missingSeedCount(savedUrls: ReadonlySet<string>): number {
  return seedSources().filter((source) => !savedUrls.has(source.url)).length
}
