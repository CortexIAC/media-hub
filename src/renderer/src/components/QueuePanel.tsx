import type { ReactElement } from 'react'
import { formatDuration, formatLongDuration } from '@core/format'
import { displayArtist } from '@core/models'
import { useData } from '../state/data'
import { usePlayerActions, usePlayerState } from '../state/player'
import { useUi } from '../state/ui'
import { Artwork } from './Artwork'
import { CloseIcon, QueueIcon, TrashIcon } from './Icons'
import { VirtualList } from './VirtualList'

export function QueuePanel(): ReactElement {
  const state = usePlayerState()
  const player = usePlayerActions()
  const data = useData()
  const ui = useUi()

  const queue = state?.queue.ids ?? []
  const entries = queue.map((id, index) => ({ id, index, track: data.tracksById.get(id) ?? null }))
  const totalMs = entries.reduce((sum, entry) => sum + (entry.track?.durationMs ?? 0), 0)

  return (
    <aside className="queue-panel" aria-label="Playback queue">
      <div className="panel-head">
        <div>
          <h2>Queue</h2>
          <div className="faint" style={{ fontSize: 11 }}>
            {queue.length} {queue.length === 1 ? 'track' : 'tracks'}
            {queue.length > 0 ? ` · ${formatLongDuration(totalMs)} total` : ''}
          </div>
        </div>
        <div className="spacer" />
        {queue.length > 0 ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void player.controller?.clearQueue()}
            title="Clear the queue without deleting anything"
          >
            Clear
          </button>
        ) : null}
        <button type="button" className="btn-icon btn-icon-sm" aria-label="Close queue" onClick={() => ui.setQueueOpen(false)}>
          <CloseIcon size={15} />
        </button>
      </div>

      <div className="panel-body">
        {queue.length === 0 ? (
          <div className="queue-empty">
            <QueueIcon size={22} />
            <p style={{ marginTop: 10 }}>
              The queue is empty.
              <br />
              Play an album or use a track’s menu to add songs.
            </p>
          </div>
        ) : (
          <VirtualList
            items={entries}
            rowHeight={50}
            renderRow={(entry) => (
              <div className={`queue-item ${state?.trackId === entry.id ? 'is-current' : ''}`}>
                <button
                  type="button"
                  className="queue-item-index"
                  style={{ width: 18 }}
                  aria-label={`Play queue item ${entry.index + 1}`}
                  onClick={() => player.jumpToQueueIndex(entry.index)}
                >
                  {entry.index + 1}
                </button>
                <button
                  type="button"
                  className="queue-item-thumb"
                  aria-label={entry.track ? `Play ${entry.track.title}` : 'Track unavailable'}
                  onClick={() => player.jumpToQueueIndex(entry.index)}
                >
                  <Artwork artworkId={entry.track?.artworkId ?? null} seed={entry.track?.album ?? entry.id} iconSize={14} />
                </button>
                <button
                  type="button"
                  className="queue-item-text"
                  onClick={() => player.jumpToQueueIndex(entry.index)}
                  style={{ background: 'none', textAlign: 'left' }}
                >
                  <span className="queue-item-title">{entry.track?.title ?? 'Unavailable track'}</span>
                  <span className="queue-item-sub">
                    {entry.track ? displayArtist(entry.track) : 'Removed from library'}
                  </span>
                </button>
                <span className="track-duration tabular" style={{ width: 38 }}>
                  {entry.track && entry.track.durationMs > 0 ? formatDuration(entry.track.durationMs) : '--:--'}
                </span>
                <button
                  type="button"
                  className="btn-icon btn-icon-sm"
                  aria-label="Remove from queue"
                  onClick={() => void player.removeFromQueue(entry.index)}
                >
                  <TrashIcon size={14} />
                </button>
              </div>
            )}
          />
        )}
      </div>
    </aside>
  )
}
