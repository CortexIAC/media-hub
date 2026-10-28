import { useMemo, type ReactElement } from 'react'
import { formatCount, formatLongDuration } from '@core/format'
import { DropdownMenu, type MenuEntry } from '../components/DropdownMenu'
import { EmptyState } from '../components/EmptyState'
import { MoreIcon, PlayIcon, PlusIcon, QueueIcon, ShuffleIcon, TrashIcon } from '../components/Icons'
import { TrackList } from '../components/TrackList'
import { useData } from '../state/data'
import { usePlayerActions } from '../state/player'
import { useUi } from '../state/ui'

export function PlaylistView({ id }: { id: string }): ReactElement {
  const data = useData()
  const ui = useUi()
  const player = usePlayerActions()

  const playlist = data.playlists.find((entry) => entry.id === id)
  const tracks = useMemo(() => {
    if (!playlist) return []
    return playlist.trackIds.map((trackId) => data.tracksById.get(trackId)).filter((track) => track !== undefined)
  }, [playlist, data.tracksById])

  if (!playlist) {
    return (
      <div className="view">
        <EmptyState icon={<QueueIcon size={24} />} title="Playlist not found" message="This playlist may have been deleted.">
          <button type="button" className="btn" onClick={() => ui.navigate({ name: 'music' })}>
            Back to music
          </button>
        </EmptyState>
      </div>
    )
  }

  const ids = tracks.map((track) => track.id)
  const missing = playlist.trackIds.length - tracks.length
  const totalMs = tracks.reduce((sum, track) => sum + track.durationMs, 0)

  const menu: MenuEntry[] = [
    { key: 'rename', label: 'Rename playlist', onSelect: () => ui.openModal({ kind: 'rename-playlist', id: playlist.id, currentName: playlist.name }) },
    { key: 'add', label: 'Add current queue', icon: <PlusIcon size={14} />, onSelect: () => player.addToQueue(ids) },
    { key: 'sep', separator: true },
    {
      key: 'delete',
      label: 'Delete playlist',
      icon: <TrashIcon size={14} />,
      danger: true,
      onSelect: () => ui.openModal({ kind: 'delete-playlist', id: playlist.id, name: playlist.name })
    }
  ]

  return (
    <div className="view">
      <div className="album-hero">
        <div className="playlist-hero-tile">
          <QueueIcon size={54} />
        </div>
        <div className="album-hero-text">
          <span className="view-eyebrow">Playlist</span>
          <h1>{playlist.name}</h1>
          <p className="view-subtitle">
            {formatCount(tracks.length, 'track')} · {formatLongDuration(totalMs)}
            {missing > 0 ? ` · ${missing} unavailable` : ''}
          </p>
          <div className="view-actions" style={{ marginLeft: 0, marginTop: 18 }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={ids.length === 0}
              onClick={() => player.playTracks(ids, ids[0])}
            >
              <PlayIcon size={15} /> Play
            </button>
            <button type="button" className="btn" disabled={ids.length === 0} onClick={() => player.shuffleAndPlay(ids)}>
              <ShuffleIcon size={15} /> Shuffle
            </button>
            <button type="button" className="btn" disabled={ids.length === 0} onClick={() => player.addToQueue(ids)}>
              <QueueIcon size={15} /> Queue
            </button>
            <DropdownMenu entries={menu} label="Playlist actions" iconOnly trigger={<MoreIcon size={16} />} />
          </div>
        </div>
      </div>

      <TrackList
        tracks={tracks}
        contextIds={ids}
        virtualized={tracks.length > 30}
        onRemove={(track) => void data.removeFromPlaylist(playlist.id, track.id)}
        onMove={(index, direction) => {
          const target = index + direction
          if (target < 0 || target >= tracks.length) return
          void data.reorderPlaylist(playlist.id, index, target)
        }}
        emptyTitle="This playlist is empty"
        emptyMessage="Use the ⋯ menu on any track to add it to this playlist."
      />
    </div>
  )
}
