import { describe, expect, it } from 'vitest'
import { activeLyricIndex, lyricsAreSynced, parseLyrics } from '@core/lyrics'

describe('parseLyrics', () => {
  it('parses plain text into unsynced lines', () => {
    const parsed = parseLyrics('First line\n\nSecond line\r\nThird line')
    expect(parsed.synced).toBe(false)
    expect(parsed.lines).toEqual([
      { timeMs: null, text: 'First line' },
      { timeMs: null, text: 'Second line' },
      { timeMs: null, text: 'Third line' }
    ])
  })

  it('returns nothing for empty input', () => {
    expect(parseLyrics(null)).toEqual({ lines: [], synced: false })
    expect(parseLyrics('   ')).toEqual({ lines: [], synced: false })
  })

  it('parses LRC timestamps and drops metadata tags', () => {
    const parsed = parseLyrics(
      '[ar:Test Artist]\n[ti:Test Song]\n[00:01.00]One\n[00:12.345]Two\n[01:02]Three'
    )
    expect(parsed.synced).toBe(true)
    expect(parsed.lines).toEqual([
      { timeMs: 1000, text: 'One' },
      { timeMs: 12_345, text: 'Two' },
      { timeMs: 62_000, text: 'Three' }
    ])
  })

  it('expands lines that carry several timestamps', () => {
    const parsed = parseLyrics('[00:05.00][00:20.00]Chorus')
    expect(parsed.lines).toEqual([
      { timeMs: 5000, text: 'Chorus' },
      { timeMs: 20_000, text: 'Chorus' }
    ])
  })

  it('sorts unordered timestamps', () => {
    const parsed = parseLyrics('[00:30.00]Later\n[00:10.00]Earlier')
    expect(parsed.lines.map((line) => line.text)).toEqual(['Earlier', 'Later'])
  })

  it('treats hundredths and milliseconds correctly', () => {
    expect(parseLyrics('[00:01.5]A').lines[0]?.timeMs).toBe(1500)
    expect(parseLyrics('[00:01.05]A').lines[0]?.timeMs).toBe(1050)
    expect(parseLyrics('[00:01.005]A').lines[0]?.timeMs).toBe(1005)
  })
})

describe('activeLyricIndex', () => {
  const { lines } = parseLyrics('[00:00.00]A\n[00:05.00]B\n[00:10.00]C')

  it('is -1 before the first line', () => {
    expect(activeLyricIndex(lines, -50)).toBeGreaterThanOrEqual(-1)
    expect(activeLyricIndex(parseLyrics('[00:05.00]A').lines, 1000)).toBe(-1)
  })

  it('moves with the playhead', () => {
    expect(activeLyricIndex(lines, 0)).toBe(0)
    expect(activeLyricIndex(lines, 4999)).toBe(0)
    expect(activeLyricIndex(lines, 5000)).toBe(1)
    expect(activeLyricIndex(lines, 60_000)).toBe(2)
  })

  it('ignores unsynced lines', () => {
    expect(activeLyricIndex([{ timeMs: null, text: 'plain' }], 5000)).toBe(-1)
  })
})

describe('lyricsAreSynced', () => {
  it('detects timestamps', () => {
    expect(lyricsAreSynced('[00:01.00]hi')).toBe(true)
    expect(lyricsAreSynced('just words')).toBe(false)
    expect(lyricsAreSynced(null)).toBe(false)
  })
})
