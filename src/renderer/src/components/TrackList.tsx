import type { ReactElement } from 'react'
import { formatDuration } from '@core/format'
import { UNKNOWN_ALBUM, UNKNOWN_ARTIST, displayArtist, type Track } from '@core/models'
import { albumKey } from '@core/search'
import { useData } from '../state/data'
import { usePlayerActions, usePlayerValue } from '../state/player'
import { useUi } from '../state/ui'
import { Artwork } from './Artwork'
import { DropdownMenu, type MenuEntry } from './DropdownMenu'
import { EmptyState } from './EmptyState'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  HeartIcon,
  MoreIcon,
  MusicIcon,
  PlayIcon,
  PlusIcon,
  QueueIcon,
  SkipForwardIcon
} from './Icons'
import { VirtualList } from './VirtualList'

export interface TrackListProps {
  tracks: Track[]
  /** Playback context (album, playlist, search results). Defaults to this list. */
  contextIds?: string[]
  onRemove?: (track: Track, index: number) => void
  removeLabel?: string
  onMove?: (index: number, direction: -1 | 1) => void
  virtualized?: boolean
  emptyTitle?: string
  emptyMessage?: string
}

export function TrackList({
  tracks,
  contextIds,
  onRemove,
  removeLabel = 'Remove from playlist',
  onMove,
  virtualized,
  emptyTitle = 'Nothing here yet',
  emptyMessage = 'Import a music folder to build your library.'
}: TrackListProps): ReactElement {
  const data = useData()
  const ui = useUi()
  const player = usePlayerActions()
  const currentTrackId = usePlayerValue((state) => state.trackId)
  const isPlaying = usePlayerValue((state) => state.status === 'playing')
  const ids = contextIds ?? tracks.map((track) => track.id)

  if (tracks.length === 0) {
    return <EmptyState icon={<MusicIcon size={24} />} title={emptyTitle} message={emptyMessage} />
  }

  const play = (track: Track): void => {
    player.playTracks(ids, track.id)
  }

  const renderRow = (track: Track, index: number): ReactElement => (
    <TrackRow
      key={track.id}
      track={track}
      index={index}
      current={currentTrackId === track.id}
      playing={currentTrackId === track.id && isPlaying === true}
      onPlay={() => play(track)}
      onRemove={onRemove ? () => onRemove(track, index) : undefined}
      removeLabel={removeLabel}
      onMove={onMove ? (direction) => onMove(index, direction) : undefined}
      playlists={data.playlists}
      favorite={data.favorites.has(track.id)}
      onToggleFavorite={() => void data.toggleFavorite(track.id)}
      onAddToPlaylist={(playlistId) => void data.addToPlaylist(playlistId, [track.id])}
      onCreatePlaylist={() => ui.openModal({ kind: 'create-playlist', trackIds: [track.id] })}
      onPlayNext={() => player.playNext([track.id])}
      onAddToQueue={() => player.addToQueue([track.id])}
      onGoToAlbum={() => ui.navigate({ name: 'album', key: albumKey(track) })}
      onGoToArtist={() => ui.navigate({ name: 'artist', artist: displayArtist(track) })}
    />
  )

  const useVirtual = virtualized ?? tracks.length > 60

  return (
    <div className={`track-list ${useVirtual ? 'is-virtual' : ''}`}>
      <div className="track-head" role="row">
        <span>#</span>
        <span>Title</span>
        <span className="col-album">Album</span>
        <span style={{ textAlign: 'right' }}>Time</span>
        <span aria-hidden="true" />
      </div>
      {useVirtual ? (
        <VirtualList items={tracks} rowHeight={52} renderRow={renderRow} />
      ) : (
        <div>{tracks.map((track, index) => renderRow(track, index))}</div>
      )}
    </div>
  )
}

interface TrackRowProps {
  track: Track
  index: number
  current: boolean
  playing: boolean
  onPlay: () => void
  onRemove?: () => void
  removeLabel: string
  onMove?: (direction: -1 | 1) => void
  playlists: Array<{ id: string; name: string }>
  favorite: boolean
  onToggleFavorite: () => void
  onAddToPlaylist: (playlistId: string) => void
  onCreatePlaylist: () => void
  onPlayNext: () => void
  onAddToQueue: () => void
  onGoToAlbum: () => void
  onGoToArtist: () => void
}

function TrackRow({
  track,
  index,
  current,
  playing,
  onPlay,
  onRemove,
  removeLabel,
  onMove,
  playlists,
  favorite,
  onToggleFavorite,
  onAddToPlaylist,
  onCreatePlaylist,
  onPlayNext,
  onAddToQueue,
  onGoToAlbum,
  onGoToArtist
}: TrackRowProps): ReactElement {
  const unreadable = track.issues.includes('unreadable') || track.issues.includes('missing-file')
  const entries: MenuEntry[] = [
    { key: 'play', label: 'Play', icon: <PlayIcon size={14} />, onSelect: onPlay },
    { key: 'next', label: 'Play next', icon: <SkipForwardIcon size={14} />, onSelect: onPlayNext },
    { key: 'queue', label: 'Add to queue', icon: <QueueIcon size={14} />, onSelect: onAddToQueue },
    { key: 'sep1', separator: true },
    {
      key: 'favorite',
      label: favorite ? 'Remove from favorites' : 'Add to favorites',
      icon: <HeartIcon size={14} filled={favorite} />,
      onSelect: onToggleFavorite
    },
    { key: 'sep2', separator: true },
    { key: 'playlists-header', header: true, label: 'Add to playlist' },
    ...playlists.slice(0, 8).map<MenuEntry>((playlist) => ({
      key: `playlist-${playlist.id}`,
      label: playlist.name,
      icon: <QueueIcon size={14} />,
      onSelect: () => onAddToPlaylist(playlist.id)
    })),
    { key: 'new-playlist', label: 'New playlist…', icon: <PlusIcon size={14} />, onSelect: onCreatePlaylist },
    { key: 'sep3', separator: true },
    { key: 'album', label: 'Go to album', icon: <ChevronRightIcon size={14} />, onSelect: onGoToAlbum },
    { key: 'artist', label: 'Go to artist', icon: <ChevronRightIcon size={14} />, onSelect: onGoToArtist }
  ]

  if (onMove) {
    entries.push(
      { key: 'sep4', separator: true },
      { key: 'up', label: 'Move up', icon: <ChevronDownIcon size={14} className="flip-vertical" />, onSelect: () => onMove(-1) },
      { key: 'down', label: 'Move down', icon: <ChevronDownIcon size={14} />, onSelect: () => onMove(1) }
    )
  }

  if (onRemove) {
    entries.push({ key: 'sep5', separator: true }, { key: 'remove', label: removeLabel, danger: true, onSelect: onRemove })
  }

  return (
    <div className={`track-row ${current ? 'is-current' : ''}`} onClick={onPlay} role="row" tabIndex={-1}>
      <div className="track-index">
        {current ? (
          <Equalizer playing={playing} />
        ) : (
          <span className="tabular">{index + 1}</span>
        )}
        <button
          type="button"
          className="track-play-overlay"
          aria-label={`Play ${track.title}`}
          onClick={(event) => {
            event.stopPropagation()
            onPlay()
          }}
        >
          <PlayIcon size={13} />
        </button>
      </div>

      <div className="track-main">
        <div className="track-thumb">
          <Artwork artworkId={track.artworkId} seed={track.album || track.title} iconSize={15} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="track-title">{track.title}</div>
          <div className="track-sub">
            {displayArtist(track)}
            {unreadable ? (
              <span className="badge badge-danger" style={{ marginLeft: 8, height: 16, fontSize: 9 }}>
                {track.issues.includes('missing-file') ? 'Missing' : 'Unreadable'}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="track-album">{track.album || UNKNOWN_ALBUM}</div>
      <div className="track-duration tabular" title={`${track.codec ?? 'audio'}${track.bitrate ? ` · ${Math.round(track.bitrate / 1000)} kbps` : ''}`}>
        {track.durationMs > 0 ? formatDuration(track.durationMs) : '--:--'}
      </div>

      <div className="track-actions">
        <button
          type="button"
          className={`btn-icon btn-icon-sm favorite-button ${favorite ? 'is-favorite' : ''}`}
          aria-label={favorite ? `Remove ${track.title} from favorites` : `Favorite ${track.title}`}
          aria-pressed={favorite}
          onClick={(event) => {
            event.stopPropagation()
            onToggleFavorite()
          }}
        >
          <HeartIcon size={14} filled={favorite} />
        </button>
        <DropdownMenu entries={entries} label={`More actions for ${track.title}`} iconOnly trigger={<MoreIcon size={15} />} />
      </div>
    </div>
  )
}

function Equalizer({ playing }: { playing: boolean }): ReactElement {
  return (
    <span className={`eq-bars ${playing ? '' : 'is-paused'}`} aria-label={playing ? 'Now playing' : 'Paused'}>
      <span />
      <span />
      <span />
    </span>
  )
}

export function trackSubtitle(track: Track): string {
  const artist = track.artist || UNKNOWN_ARTIST
  return track.album ? `${artist} · ${track.album}` : artist
}
