import { describe, expect, it } from 'vitest'
import {
  classifyStream,
  extensionOfUrl,
  looksLikeHlsPlaylist,
  nameFromUrl,
  normalizeStreamUrl,
  parsePlaylist,
  rewriteHlsPlaylist,
  sanitizeStreamSource,
  streamIdFor
} from '@core/streams'
import { missingSeedCount, seedSources, STREAM_SEEDS } from '@core/streamSeeds'

const CHANNEL_LIST = `\uFEFF#EXTM3U
#EXTINF:-1 tvg-id="bbc1" tvg-logo="https://cdn.example/logos/bbc1.png" group-title="News",BBC One
https://stream.example/live/bbc1/index.m3u8
#EXTINF:-1 group-title="News",BBC Two
https://stream.example/live/bbc2/index.m3u8
#EXTGRP:Radio
#EXTINF:0,Radio Four
http://radio.example:8000/stream
https://plain.example/one.mp4
`

const PLS_LIST = `[playlist]
NumberOfEntries=2
File1=https://stream.example/eins.m3u8
Title1=Channel Eins
Length1=-1
File2=https://stream.example/zwei.mp4
Title2=Channel Zwei`

describe('normalizeStreamUrl', () => {
  it('keeps well formed http(s) links intact', () => {
    expect(normalizeStreamUrl('https://example.com/a.m3u8')).toBe('https://example.com/a.m3u8')
    expect(normalizeStreamUrl('http://example.com:8000/live')).toBe('http://example.com:8000/live')
  })

  it('adds https to a bare host so pasted links work', () => {
    expect(normalizeStreamUrl('example.com/stream/a.m3u8')).toBe('https://example.com/stream/a.m3u8')
    expect(normalizeStreamUrl('  http://example.com/x  ')).toBe('http://example.com/x')
  })

  it('refuses anything that is not a network stream', () => {
    expect(normalizeStreamUrl('')).toBeNull()
    expect(normalizeStreamUrl('magnet:?xt=urn:btih:abc')).toBeNull()
    expect(normalizeStreamUrl('file:///c:/media/film.mkv')).toBeNull()
    expect(normalizeStreamUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeStreamUrl('https://')).toBeNull()
    expect(normalizeStreamUrl(`https://example.com/${'a'.repeat(5000)}`)).toBeNull()
  })
})

describe('nameFromUrl', () => {
  it('derives a readable label from the last path segment', () => {
    expect(nameFromUrl('https://example.com/live/bbc_one_hd.m3u8')).toBe('bbc one hd')
    expect(nameFromUrl('https://example.com/media/holiday-tape.mp4')).toBe('holiday tape')
    expect(nameFromUrl('https://example.com/index.m3u8')).toBe('example.com')
  })

  it('falls back to the host when there is no useful path', () => {
    expect(nameFromUrl('https://radio.example:8000/')).toBe('radio.example')
  })
})

describe('parsePlaylist', () => {
  it('expands an M3U channel list with titles, groups and logos', () => {
    const parsed = parsePlaylist(CHANNEL_LIST)
    expect(parsed.kind).toBe('m3u')
    if (parsed.kind !== 'm3u') return
    expect(parsed.entries).toHaveLength(4)
    expect(parsed.entries[0]).toEqual({
      name: 'BBC One',
      url: 'https://stream.example/live/bbc1/index.m3u8',
      group: 'News',
      logoUrl: 'https://cdn.example/logos/bbc1.png'
    })
    // #EXTGRP applies to the entries that follow it.
    expect(parsed.entries[2]).toMatchObject({ name: 'Radio Four', group: 'Radio' })
    // A bare URL with no #EXTINF still becomes a usable entry.
    expect(parsed.entries[3]).toMatchObject({ name: 'one', group: 'Radio' })
  })

  it('parses a PLS playlist', () => {
    const parsed = parsePlaylist(PLS_LIST)
    expect(parsed.kind).toBe('pls')
    if (parsed.kind !== 'pls') return
    expect(parsed.entries.map((entry) => entry.name)).toEqual(['Channel Eins', 'Channel Zwei'])
    expect(parsed.entries[1]?.url).toBe('https://stream.example/zwei.mp4')
  })

  it('recognises an HLS playlist instead of treating its segments as channels', () => {
    const media = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXTINF:6.0,
segment0.ts
#EXTINF:6.0,
segment1.ts
#EXT-X-ENDLIST`
    expect(parsePlaylist(media)).toEqual({ kind: 'hls' })
  })

  it('reports empty and invalid bodies without throwing', () => {
    expect(parsePlaylist('')).toEqual({ kind: 'empty' })
    expect(parsePlaylist('   \n  ')).toEqual({ kind: 'empty' })
    expect(parsePlaylist('#EXTM3U\n#EXTINF:-1,')).toEqual({ kind: 'empty' })
    expect(parsePlaylist('<html><body>404</body></html>')).toEqual({ kind: 'invalid' })
  })

  it('skips entries whose URL is not streamable', () => {
    const parsed = parsePlaylist('#EXTM3U\n#EXTINF:-1,Bad\nmagnet:?xt=urn:btih:abc\n#EXTINF:-1,Good\nhttps://ok.example/a.mp3')
    expect(parsed.kind).toBe('m3u')
    if (parsed.kind !== 'm3u') return
    expect(parsed.entries).toHaveLength(1)
    expect(parsed.entries[0]?.name).toBe('Good')
  })
})

describe('classifyStream', () => {
  it('routes HLS by extension or content type', () => {
    expect(classifyStream('https://a.example/live/index.m3u8').kind).toBe('hls')
    expect(classifyStream('https://a.example/stream', 'application/vnd.apple.mpegurl').kind).toBe('hls')
    expect(classifyStream('https://a.example/stream', 'application/x-mpegURL; charset=utf-8').kind).toBe('hls')
  })

  it('accepts what Chromium can actually decode', () => {
    expect(classifyStream('https://a.example/clip.mp4').kind).toBe('progressive')
    expect(classifyStream('https://a.example/radio.mp3').kind).toBe('progressive')
    expect(classifyStream('https://a.example/audio.flac').kind).toBe('progressive')
    expect(classifyStream('https://a.example/track', 'audio/mpeg').kind).toBe('progressive')
  })

  it('marks containers that need a native player and says why', () => {
    const mkv = classifyStream('https://a.example/film.mkv')
    expect(mkv.kind).toBe('unsupported')
    expect(mkv.reason).toContain('VLC')

    const avi = classifyStream('https://a.example/clip.avi', 'video/x-msvideo')
    expect(avi.kind).toBe('unsupported')

    const ts = classifyStream('https://a.example/channel.ts')
    expect(ts.kind).toBe('unsupported')
  })

  it('lets an unknown extension through so the player can try', () => {
    expect(classifyStream('https://a.example/live/stream', 'video/mp4').kind).toBe('progressive')
    expect(classifyStream('https://a.example/live/stream').kind).toBe('progressive')
  })

  it('rejects a response that is plainly not media', () => {
    const page = classifyStream('https://a.example/watch', 'text/html')
    expect(page.kind).toBe('unsupported')
    expect(page.reason).toContain('text/html')
  })
})

describe('extensionOfUrl', () => {
  it('ignores query strings and casing', () => {
    expect(extensionOfUrl('https://a.example/x.MKV?token=1')).toBe('.mkv')
    expect(extensionOfUrl('https://a.example/x/')).toBe('')
    expect(extensionOfUrl('not a url')).toBe('')
  })
})

describe('rewriteHlsPlaylist', () => {
  const proxy = (uri: string): string => `bunny-stream://proxy/${encodeURIComponent(new URL(uri, 'https://cdn.example/live/index.m3u8').toString())}`

  it('rewrites relative segment URIs against the playlist base', () => {
    const output = rewriteHlsPlaylist('#EXTM3U\n#EXTINF:6,\nsegment0.ts\n#EXT-X-ENDLIST', proxy)
    expect(output).toContain(`bunny-stream://proxy/${encodeURIComponent('https://cdn.example/live/segment0.ts')}`)
    expect(output).toContain('#EXT-X-ENDLIST')
  })

  it('rewrites master playlist variants and their attributes', () => {
    const master = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=1280x720
720p/index.m3u8`
    const output = rewriteHlsPlaylist(master, proxy)
    expect(output).toContain(encodeURIComponent('https://cdn.example/live/720p/index.m3u8'))
    expect(output).toContain('#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=1280x720')
  })

  it('rewrites key, init segment and part URIs', () => {
    const media = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="keys/k1.bin"
#EXT-X-MAP:URI="init.mp4"
#EXT-X-PART:DURATION=1.0,URI="part.1.m4s"
#EXTINF:6,
seg1.m4s`
    const output = rewriteHlsPlaylist(media, proxy)
    expect(output).toContain(`URI="bunny-stream://proxy/${encodeURIComponent('https://cdn.example/live/keys/k1.bin')}"`)
    expect(output).toContain(encodeURIComponent('https://cdn.example/live/init.mp4'))
    expect(output).toContain(encodeURIComponent('https://cdn.example/live/part.1.m4s'))
    expect(output).toContain(encodeURIComponent('https://cdn.example/live/seg1.m4s'))
    expect(output).not.toContain('URI="keys/k1.bin"')
  })

  it('leaves comments, blank lines and absolute URIs untouched apart from proxying', () => {
    const output = rewriteHlsPlaylist('#EXTM3U\n\n# a comment\nhttps://other.example/x.ts', proxy)
    expect(output.split('\n')[0]).toBe('#EXTM3U')
    expect(output).toContain('# a comment')
    expect(output).toContain(encodeURIComponent('https://other.example/x.ts'))
  })
})

describe('looksLikeHlsPlaylist', () => {
  it('detects a playlist body and a playlist content type', () => {
    expect(looksLikeHlsPlaylist('#EXTM3U\n#EXT-X-VERSION:3')).toBe(true)
    expect(looksLikeHlsPlaylist('', 'application/vnd.apple.mpegurl')).toBe(true)
    expect(looksLikeHlsPlaylist('{"json":true}', 'application/json')).toBe(false)
  })
})

describe('sanitizeStreamSource', () => {
  it('builds a stable id from the URL so duplicates collapse', () => {
    const first = sanitizeStreamSource({ url: 'https://a.example/live.m3u8', name: 'Live' })
    const second = sanitizeStreamSource({ url: 'https://a.example/live.m3u8', name: 'Other name' })
    expect(first?.id).toBe(second?.id)
    expect(first?.id).toBe(streamIdFor('https://a.example/live.m3u8'))
    expect(first?.kind).toBe('hls')
  })

  it('infers the kind when a stored entry predates it', () => {
    expect(sanitizeStreamSource({ url: 'https://a.example/x.mkv' })?.kind).toBe('unsupported')
    expect(sanitizeStreamSource({ url: 'https://a.example/x.mp4' })?.kind).toBe('progressive')
  })

  it('falls back to a derived name and rejects unusable input', () => {
    const source = sanitizeStreamSource({ url: 'https://a.example/live/my_channel.m3u8' })
    expect(source?.name).toBe('my channel')
    expect(sanitizeStreamSource({ url: 'magnet:?xt=urn:btih:abc' })).toBeNull()
    expect(sanitizeStreamSource({})).toBeNull()
    expect(sanitizeStreamSource(null)).toBeNull()
  })

  it('drops a logo that is not an http(s) URL', () => {
    expect(sanitizeStreamSource({ url: 'https://a.example/x.mp4', logoUrl: 'javascript:alert(1)' })?.logoUrl).toBeNull()
    expect(sanitizeStreamSource({ url: 'https://a.example/x.mp4', logoUrl: 'https://a.example/l.png' })?.logoUrl).toBe(
      'https://a.example/l.png'
    )
  })
})

describe('bundled stream suggestions', () => {
  it('are all valid http(s) links with unique ids', () => {
    const seeds = seedSources(1_700_000_000_000)
    expect(seeds.length).toBeGreaterThanOrEqual(8)
    expect(new Set(seeds.map((seed) => seed.id)).size).toBe(seeds.length)
    expect(new Set(seeds.map((seed) => seed.url)).size).toBe(seeds.length)
    for (const seed of seeds) {
      expect(normalizeStreamUrl(seed.url)).toBe(seed.url)
      expect(seed.name.trim().length).toBeGreaterThan(0)
      expect(seed.group).toBeTruthy()
      expect(seed.addedAt).toBe(1_700_000_000_000)
    }
  })

  it('classifies the HLS suggestion correctly and nothing as unsupported', () => {
    for (const seed of STREAM_SEEDS) {
      const expected = seed.url.endsWith('.m3u8') ? 'hls' : 'progressive'
      expect(classifyStream(seed.url).kind).toBe(expected)
    }
  })

  it('only counts suggestions that are not saved yet', () => {
    const saved = new Set(STREAM_SEEDS.slice(0, 3).map((seed) => normalizeStreamUrl(seed.url) as string))
    expect(missingSeedCount(saved)).toBe(STREAM_SEEDS.length - 3)
    expect(missingSeedCount(new Set(STREAM_SEEDS.map((seed) => normalizeStreamUrl(seed.url) as string)))).toBe(0)
  })
})
