import { describe, expect, it } from 'vitest'
import {
  decodeSubtitleBytes,
  labelEpisode,
  parseArchiveItem,
  parseArchiveLength,
  parseArchiveSearchDocs,
  pickPlayableFiles,
  rankArchiveSearchDocs,
  rightsLabel,
  sanitizeArchiveRecord,
  toWebVtt
} from '@core/archive'

describe('labelEpisode', () => {
  it('reads SxxExx and keeps the episode name', () => {
    const label = labelEpisode('Tower_Prep_S01E02_Monitored.mp4', 'Tower Prep - Complete Series')
    expect(label.season).toBe(1)
    expect(label.episode).toBe(2)
    expect(label.title).toBe('Monitored')
    expect(label.label).toBe('S01E02 · Monitored')
  })

  it('reads 1x02 and Episode 12 forms', () => {
    expect(labelEpisode('Show 1x07 Name.mp4', 'Show').label).toBe('S01E07 · Name')
    expect(labelEpisode('Show - Episode 12 - The Cave.mp4', 'Show').label).toBe('Ep 12 · The Cave')
    expect(labelEpisode('Show Part 3.mp4', 'Show').label).toBe('Ep 3 · Show')
  })

  it('keeps a leading episode number and strips the show prefix', () => {
    const label = labelEpisode('03 - Angelina Ballerina - The Ballet Tickets.mp4', 'Angelina Ballerina')
    expect(label.episode).toBe(3)
    expect(label.title).toContain('The Ballet Tickets')
  })

  it('falls back to the cleaned file name without inventing numbers', () => {
    const label = labelEpisode('Blue_s_Clues_-_Snack_Time.mp4', 'Blue’s Clues')
    expect(label.season).toBeNull()
    expect(label.episode).toBeNull()
    expect(label.label).not.toMatch(/^S\d/)
    expect(label.label).toContain('Snack Time')
  })
})

describe('archive file selection', () => {
  it('collapses derivatives of one recording and prefers the original mp4', () => {
    const picked = pickPlayableFiles([
      { name: 'Movie.ia.mp4', format: 'h.264 IA', size: '100' },
      { name: 'Movie.mp4', format: 'MPEG4', size: '200' },
      { name: 'Movie_512kb.mp4', format: '512Kb MPEG4', size: '90' },
      { name: 'Movie.ogv', format: 'Ogg Video', size: '80' },
      { name: 'Movie.gif', format: 'Animated GIF', size: '5' },
      { name: 'Movie.txt', format: 'Text', size: '1' }
    ])
    expect(picked).toHaveLength(1)
    expect(picked[0]?.name).toBe('Movie.mp4')
  })

  it('keeps separate episodes and drops the audio copy of a video', () => {
    const picked = pickPlayableFiles([
      { name: 'ep1.mp4', format: 'MPEG4' },
      { name: 'ep1.mp3', format: 'MP3' },
      { name: 'ep2.mp4', format: 'MPEG4' }
    ])
    expect(picked.map((file) => file.name)).toEqual(['ep1.mp4', 'ep2.mp4'])
  })
})

describe('parseArchiveLength', () => {
  it('accepts seconds, mm:ss and hh:mm:ss', () => {
    expect(parseArchiveLength('14314.54')).toBe(14_314_540)
    expect(parseArchiveLength('59:59')).toBe(3_599_000)
    expect(parseArchiveLength('1:02:03.5')).toBe(3_723_500)
    expect(parseArchiveLength('not a time')).toBeNull()
  })
})

const ITEM = {
  metadata: {
    identifier: 'demo-show',
    title: 'Demo Show',
    creator: ['A Person'],
    year: '2004',
    description: '<p>A demo.</p>',
    collection: ['classic_tv'],
    licenseurl: 'https://creativecommons.org/publicdomain/mark/1.0/',
    mediatype: 'movies'
  },
  files: [
    { name: 'Demo_Show_S01E01_Pilot.mp4', format: 'MPEG4', length: '1500.5', size: '1000' },
    { name: 'Demo_Show_S01E01_Pilot.ia.mp4', format: 'h.264 IA', length: '1500', size: '900' },
    { name: 'Demo_Show_S01E02_Second.mp4', format: 'MPEG4', length: '28:10', size: '1100' },
    { name: 'Demo_Show_S01E02_Second.mpg', format: 'MPEG2', length: '1690' },
    { name: 'Demo_Show_S01E01_Pilot.cc1.srt', format: 'SubRip', size: '1200' },
    { name: 'Demo_Show_S01E02_Second.cc1.srt', format: 'SubRip', size: '1300' },
    { name: 'Demo_Show_S01E01_Pilot.gif', format: 'Animated GIF', size: '90' },
    { name: 'Demo_Show.thumbs/thumb.jpg', format: 'Thumbnail', size: '10' }
  ]
}

describe('parseArchiveItem', () => {
  it('builds ordered, labelled episodes with matching captions', () => {
    const item = parseArchiveItem('demo-show', ITEM)
    expect(item).not.toBeNull()
    expect(item?.episodes).toHaveLength(2)
    expect(item?.episodes[0]?.label).toBe('S01E01 · Pilot')
    expect(item?.episodes[0]?.durationMs).toBe(1_500_500)
    expect(item?.episodes[0]?.url).toContain('https://archive.org/download/demo-show/Demo_Show_S01E01_Pilot.mp4')
    expect(item?.episodes[0]?.subtitles[0]?.url).toContain('.cc1.srt')
    expect(item?.episodes[1]?.label).toBe('S01E02 · Second')
    expect(item?.episodes[1]?.durationMs).toBe(1_690_000)
    expect(item?.episodes[1]?.subtitles).toHaveLength(1)
    expect(item?.episodes[1]?.subtitles[0]?.label).toContain('English')
    expect(rightsLabel(item?.licenseUrl ?? null)).toContain('public domain')
  })

  it('returns null for a dark item or one with no playable media', () => {
    expect(parseArchiveItem('demo-show', { ...ITEM, is_dark: true })).toBeNull()
    expect(parseArchiveItem('demo-show', { ...ITEM, files: [{ name: 'a.txt', format: 'Text' }] })).toBeNull()
    expect(parseArchiveItem('../etc/passwd', ITEM)).toBeNull()
  })
})

describe('toWebVtt', () => {
  it('converts SubRip cues, numbers and ASS tags to WebVTT', () => {
    const srt = '\uFEFF1\r\n00:00:01,000 --> 00:00:04,000\r\n{\\an8}Hello there\r\n\r\n2\r\n00:00:05,500 --> 00:00:07,250\r\n<i>Second line</i>\r\n'
    const vtt = toWebVtt(srt)
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true)
    expect(vtt).toContain('00:00:01.000 --> 00:00:04.000')
    expect(vtt).toContain('Hello there')
    expect(vtt).not.toContain('\\an8')
    expect(vtt).toContain('<i>Second line</i>')
    expect(vtt).not.toMatch(/\n1\n/)
    expect(vtt).toContain('\n\n')
  })

  it('decodes UTF-16LE sidecars exported by Windows tools', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:02,000\r\nHello from UTF-16\r\n'
    const bytes = Buffer.from('\uFEFF' + srt, 'utf16le')
    const decoded = decodeSubtitleBytes(bytes)
    expect(decoded).toContain('Hello from UTF-16')
    expect(toWebVtt(decoded)).toContain('00:00:01.000 --> 00:00:02.000')
  })

  it('passes existing WebVTT through unchanged', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHi\n'
    expect(toWebVtt(vtt)).toBe(vtt)
  })

  it('keeps cue settings on the timing line', () => {
    const vtt = toWebVtt('1\n00:00:01,000 --> 00:00:02,000 align:start\nHi\n')
    expect(vtt).toContain('00:00:01.000 --> 00:00:02.000 align:start')
  })
})

describe('rankArchiveSearchDocs', () => {
  it('puts the title the user typed ahead of incidental mentions', () => {
    const docs = [
      { identifier: 'a', title: 'Interview w/Barney Frank', creator: null, year: 2006, description: null, collection: 'tvnews', mediaType: 'movies' as const, downloads: 9000 },
      { identifier: 'b', title: 'Barney & Friends: Min’s Pattern', creator: null, year: 1994, description: null, collection: 'animationandcartoons', mediaType: 'movies' as const, downloads: 12 },
      { identifier: 'c', title: 'The Barney Show', creator: null, year: 1992, description: null, collection: 'classic_tv', mediaType: 'movies' as const, downloads: 40 }
    ]
    const ranked = rankArchiveSearchDocs(docs, 'barney')
    expect(ranked[0]?.identifier).toBe('b')
    expect(ranked[1]?.identifier).toBe('c')
  })

  it('matches apostrophes either way and leaves an empty query alone', () => {
    const docs = [
      { identifier: 'x', title: 'Blues Clues Playtime', creator: null, year: null, description: null, collection: null, mediaType: 'movies' as const, downloads: 0 },
      { identifier: 'y', title: 'Blue’s Room: Holiday Wishes', creator: null, year: null, description: null, collection: null, mediaType: 'movies' as const, downloads: 0 }
    ]
    expect(rankArchiveSearchDocs(docs, "blue's clues")[0]?.identifier).toBe('x')
    expect(rankArchiveSearchDocs(docs, '')).toBe(docs)
  })
})

describe('parseArchiveSearchDocs', () => {
  it('validates identifiers, drops duplicates and normalises fields', () => {
    const hits = parseArchiveSearchDocs([
      { identifier: 'ok_item', title: 'Ok <b>Item</b>', year: '1999', creator: ['Someone'], downloads: 12.4 },
      { identifier: 'ok_item', title: 'Duplicate' },
      { identifier: 'bad id!', title: 'Nope' },
      { title: 'No identifier' }
    ])
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ identifier: 'ok_item', title: 'Ok Item', year: 1999, downloads: 12 })
  })
})

describe('sanitizeArchiveRecord', () => {
  it('rejects foreign URLs and reindexes episodes', () => {
    const record = sanitizeArchiveRecord({
      identifier: 'demo-show',
      title: 'Demo',
      episodes: [
        { label: 'One', fileName: 'one.mp4', url: 'https://example.com/one.mp4' },
        { label: 'Two', fileName: 'two.mp4', url: 'https://archive.org/download/demo-show/two.mp4', index: 69 }
      ]
    })
    expect(record?.episodes).toHaveLength(1)
    expect(record?.episodes[0]?.index).toBe(0)
    expect(record?.episodes[0]?.label).toBe('Two')
  })

  it('rejects junk records', () => {
    expect(sanitizeArchiveRecord(null)).toBeNull()
    expect(sanitizeArchiveRecord({ identifier: 'x', title: '', episodes: [] })).toBeNull()
  })
})
