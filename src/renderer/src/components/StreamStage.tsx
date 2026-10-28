import { useState, type ReactElement } from 'react'
import { useStreams } from '../state/streams'
import { useUi } from '../state/ui'
import { CloseIcon, ExternalIcon, MaximizeIcon } from './Icons'
import { StreamPlayer } from './StreamPlayer'

/**
 * The one network-stream player in the app.
 *
 * On the Streams screen it is the large stage above the list; anywhere else it
 * docks to the corner and keeps playing, because the element is mounted by the
 * shell and only its CSS box changes. That is the difference between a desktop
 * media player and a web page that stops when you navigate away.
 */
export function StreamStage(): ReactElement | null {
  const ui = useUi()
  const streams = useStreams()
  const [attempt, setAttempt] = useState(0)

  const source = streams.current
  if (!source) return null

  // Archive episodes use the same player; their full screen is where they were
  // started, so the maximise button returns there rather than to Streams.
  const home: 'archive' | 'streams' = source.id.startsWith('archive:') ? 'archive' : 'streams'
  const docked = ui.route.name !== home
  const unsupported = source.kind === 'unsupported'
  const playing = streams.status === 'playing'

  const retry = (): void => {
    streams.setError(null)
    streams.setStatus('loading')
    setAttempt((value) => value + 1)
  }

  return (
    <section className={`stream-host ${docked ? 'is-dock' : 'is-stage'}`} aria-label={`Stream: ${source.name}`}>
      {docked ? (
        <div className="stream-dock-bar">
          <div className="stream-dock-text">
            <span className="stream-dock-eyebrow">{playing ? 'Live stream' : 'Stream'}</span>
            <span className="stream-dock-title" title={source.name}>
              {source.name}
            </span>
          </div>
          <div className="stream-dock-actions">
            <button
              type="button"
              className="btn-icon btn-icon-sm"
              aria-label={home === 'archive' ? 'Open the Archive screen' : 'Open the Streams screen'}
              title={home === 'archive' ? 'Open the Archive screen' : 'Open the Streams screen'}
              onClick={() => ui.navigate({ name: home })}
            >
              <MaximizeIcon size={13} />
            </button>
            <button
              type="button"
              className="btn-icon btn-icon-sm"
              aria-label="Stop the stream"
              title="Stop the stream"
              onClick={streams.stop}
            >
              <CloseIcon size={13} />
            </button>
          </div>
        </div>
      ) : null}

      <div className="stream-frame">
        {unsupported ? null : (
          <StreamPlayer
            key={`${source.id}:${attempt}`}
            source={source}
            onStatus={streams.setStatus}
            onError={streams.setError}
            onCaptionError={(label) =>
              ui.pushToast({
                kind: 'info',
                title: 'Captions unavailable',
                message: `${label} could not be loaded from the source. Archive episodes accept your own .srt or .vtt file.`
              })
            }
          />
        )}

        {!unsupported && streams.status === 'loading' && !streams.error ? (
          <div className="stream-overlay" role="status">
            <span className="spinner" />
            <span>Buffering…</span>
          </div>
        ) : null}

        {streams.error ? (
          <div className="stream-overlay is-error">
            <p className="stream-error-title">{unsupported ? 'Needs an external player' : 'Playback problem'}</p>
            <p className="stream-error-body">{streams.error}</p>
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => void streams.openExternally(source)}
              >
                <ExternalIcon size={12} /> Open in VLC
              </button>
              {unsupported ? null : (
                <button type="button" className="btn btn-sm btn-ghost" onClick={retry}>
                  Retry
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="stream-stage-meta">
        <div className="stream-stage-text">
          <span className="stream-stage-title" title={source.url}>
            {source.name}
          </span>
          <span className="stream-stage-url mono">{source.url}</span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <span className={`badge ${playing ? 'is-live' : ''}`}>
            {playing ? 'Playing' : streams.status === 'error' ? 'Error' : streams.status === 'loading' ? 'Buffering' : 'Paused'}
          </span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => void streams.openExternally(source)}>
            <ExternalIcon size={12} /> VLC
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={streams.stop} aria-label="Stop the stream">
            <CloseIcon size={12} /> Stop
          </button>
        </div>
      </div>
    </section>
  )
}
