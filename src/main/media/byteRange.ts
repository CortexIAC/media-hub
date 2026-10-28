export interface ByteRange {
  start: number
  end: number
}

/**
 * Parse a single `bytes=start-end` range for the media protocol.
 * Multi-range requests and malformed headers are rejected.
 */
export function parseRange(header: string | null, size: number): ByteRange | 'invalid' | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return 'invalid'
  const startRaw = match[1] ?? ''
  const endRaw = match[2] ?? ''

  if (startRaw === '' && endRaw === '') return 'invalid'

  let start: number
  let end: number
  if (startRaw === '') {
    const suffix = Number(endRaw)
    if (!Number.isFinite(suffix) || suffix <= 0) return 'invalid'
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(startRaw)
    end = endRaw === '' ? size - 1 : Number(endRaw)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 'invalid'
    if (start >= size) return 'invalid'
    end = Math.min(end, size - 1)
    if (end < start) return 'invalid'
  }
  return { start, end }
}
