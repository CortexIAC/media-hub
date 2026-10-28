import { describe, expect, it } from 'vitest'
import { parseRange } from '../../src/main/media/byteRange'

describe('parseRange', () => {
  it('returns null without a header', () => {
    expect(parseRange(null, 1000)).toBeNull()
    expect(parseRange('', 1000)).toBeNull()
  })

  it('parses explicit, open-ended and suffix ranges', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 })
    expect(parseRange('bytes=500-', 1000)).toEqual({ start: 500, end: 999 })
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
    expect(parseRange('bytes=0-9999', 1000)).toEqual({ start: 0, end: 999 })
  })

  it('rejects unsatisfiable or malformed ranges', () => {
    expect(parseRange('bytes=2000-', 1000)).toBe('invalid')
    expect(parseRange('bytes=10-5', 1000)).toBe('invalid')
    expect(parseRange('bytes=-', 1000)).toBe('invalid')
    expect(parseRange('bytes=abc', 1000)).toBe('invalid')
    expect(parseRange('bytes=0-1,4-5', 1000)).toBe('invalid')
    expect(parseRange('items=0-10', 1000)).toBe('invalid')
  })

  it('handles empty files deterministically', () => {
    expect(parseRange('bytes=0-', 0)).toBe('invalid')
    expect(parseRange(null, 0)).toBeNull()
  })
})
