import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { activeLyricIndex, parseLyrics } from '@core/lyrics'
import type { LyricsResult } from '@shared/ipc'

interface LyricsState {
  status: 'loading' | 'ready' | 'empty' | 'error'
  data: LyricsResult | null
  error: string | null
}

/**
 * Lyrics for the current track: sidecar/embedded text first (served by the main
 * process), then an LRCLIB lookup. Synced lines follow the playhead.
 */
export function LyricsPanel({ trackId, positionMs }: { trackId: string; positionMs: number }): ReactElement {
  const [state, setState] = useState<LyricsState>({ status: 'loading', data: null, error: null })
  const scroller = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading', data: null, error: null })
    void window.bunny.lyrics
      .get(trackId)
      .then((result) => {
        if (cancelled) return
        setState(result ? { status: 'ready', data: result, error: null } : { status: 'empty', data: null, error: null })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          status: 'error',
          data: null,
          error: error instanceof Error ? error.message : String(error)
        })
      })
    return () => {
      cancelled = true
    }
  }, [trackId])

  const parsed = useMemo(() => parseLyrics(state.data?.text), [state.data])
  const active = parsed.synced ? activeLyricIndex(parsed.lines, positionMs) : -1

  useEffect(() => {
    if (active < 0 || !scroller.current) return
    const line = scroller.current.querySelector<HTMLElement>('.lyric-line.is-active')
    if (!line) return
    const container = scroller.current
    const target = line.offsetTop - container.clientHeight / 2 + line.clientHeight / 2
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [active])

  return (
    <section className="np-lyrics" aria-label="Lyrics">
      <div className="np-lyrics-head">
        <h3>Lyrics</h3>
        {state.data ? (
          <span className="faint" style={{ fontSize: 11 }}>
            {state.data.provider}
            {parsed.synced ? ' · synced' : ' · plain'}
          </span>
        ) : null}
      </div>

      {state.status === 'loading' ? (
        <p className="faint np-lyrics-note">Looking for lyrics…</p>
      ) : state.status === 'error' ? (
        <p className="faint np-lyrics-note">Lyrics could not be loaded: {state.error}</p>
      ) : state.status === 'empty' || parsed.lines.length === 0 ? (
        <p className="faint np-lyrics-note">
          No lyrics found in the file, next to it, or on LRCLIB. Add a <span className="mono">.lrc</span> file beside the track to
          supply your own.
        </p>
      ) : (
        <div className={`lyrics-scroll ${parsed.synced ? 'is-synced' : ''}`} ref={scroller}>
          {parsed.lines.map((line, index) => (
            <div
              key={`${index}-${line.timeMs ?? 'plain'}`}
              className={`lyric-line ${index === active ? 'is-active' : ''}`}
            >
              {line.text}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
