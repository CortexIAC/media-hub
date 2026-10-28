/**
 * Lyrics parsing. Handles plain text and LRC (synced) lyrics, both of which
 * arrive from embedded tags, `.lrc` sidecar files or the LRCLIB API.
 */

export interface LyricLine {
  /** Timestamp in milliseconds, or null for unsynced lines. */
  timeMs: number | null
  text: string
}

export interface ParsedLyrics {
  lines: LyricLine[]
  synced: boolean
}

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
const METADATA_TAG = /^\[[a-zA-Z#]+:[^\]]*\]$/

export function parseLyrics(raw: string | null | undefined): ParsedLyrics {
  if (!raw) return { lines: [], synced: false }
  const text = raw.replace(/\r\n?/g, '\n').trim()
  if (!text) return { lines: [], synced: false }

  const lines: LyricLine[] = []
  let synced = false

  for (const source of text.split('\n')) {
    const line = source.trim()
    if (!line) continue

    TIME_TAG.lastIndex = 0
    const stamps = [...line.matchAll(TIME_TAG)]
    if (stamps.length === 0) {
      // LRC metadata such as [ar:Artist] or [offset:250] is not a lyric line.
      if (METADATA_TAG.test(line)) continue
      lines.push({ timeMs: null, text: line })
      continue
    }

    const lyric = line.replace(TIME_TAG, '').trim()
    if (!lyric) continue
    for (const stamp of stamps) {
      lines.push({ timeMs: toMilliseconds(stamp[1], stamp[2], stamp[3]), text: lyric })
    }
    synced = true
  }

  if (synced) {
    lines.sort((a, b) => (a.timeMs ?? 0) - (b.timeMs ?? 0))
  }

  return { lines, synced }
}

function toMilliseconds(minutes: string | undefined, seconds: string | undefined, fraction: string | undefined): number {
  const minutesValue = Number(minutes ?? 0)
  const secondsValue = Number(seconds ?? 0)
  const fractionValue = fraction ?? ''
  const ms =
    fractionValue.length === 3
      ? Number(fractionValue)
      : fractionValue.length === 2
        ? Number(fractionValue) * 10
        : fractionValue.length === 1
          ? Number(fractionValue) * 100
          : 0
  return Math.max(0, Math.round(minutesValue * 60_000 + secondsValue * 1000 + ms))
}

/** Index of the line that is currently being sung, or -1 before the first. */
export function activeLyricIndex(lines: readonly LyricLine[], positionMs: number): number {
  let active = -1
  for (let index = 0; index < lines.length; index += 1) {
    const time = lines[index]?.timeMs
    if (time === null || time === undefined) continue
    if (time > positionMs) break
    active = index
  }
  return active
}

/** True when the text has at least one timestamp. */
export function lyricsAreSynced(raw: string | null | undefined): boolean {
  return parseLyrics(raw).synced
}
