import type { CSSProperties, ReactElement } from 'react'
import { formatDuration, formatFileSize, formatLongDuration, formatSampleRate } from '@core/format'
import { displayArtist } from '@core/models'
import { Artwork } from '../components/Artwork'
import { DropdownMenu, type MenuEntry } from '../components/DropdownMenu'
import { EmptyState } from '../components/EmptyState'
import {
  HeartIcon,
  MoreIcon,
  MusicIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  QueueIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  VolumeIcon,
  VolumeMuteIcon
} from '../components/Icons'
import { SeekBar } from '../components/SeekBar'
import { useData } from '../state/data'
import { usePlayerActions, usePlayerState } from '../state/player'
import { useUi } from '../state/ui'

export function NowPlayingView(): ReactElement {
  const player = usePlayerActions()
  const state = usePlayerState()
  const data = useData()
  const ui = useUi()

  const track = state?.trackId ? data.tracksById.get(state.trackId) ?? null : null
  const isPlaying = state?.status === 'playing'
  const favorite = track ? data.favorites.has(track.id) : false
  const repeat = state?.queue.repeat ?? 'off'

  if (!track) {
    return (
      <div className="view">
        <div className="view-header">
          <div className="view-header-text">
            <span className="view-eyebrow">Now playing</span>
            <h1>Nothing playing</h1>
          </div>
        </div>
        <EmptyState
          icon={<MusicIcon size={24} />}
          title="Nothing is playing"
          message="Choose a track from the library, an album or a playlist. The player bar stays visible while you browse."
        >
          <button type="button" className="btn btn-primary" onClick={() => ui.navigate({ name: 'music' })}>
            Browse music
          </button>
        </EmptyState>
      </div>
    )
  }

  const queue = state?.queue.ids ?? []
  const currentIndex = state?.queue.index ?? 0
  const upcoming = queue
    .slice(currentIndex + 1, currentIndex + 6)
    .map((id) => data.tracksById.get(id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  const menu: MenuEntry[] = [
    { key: 'queue', label: 'Add to queue', icon: <QueueIcon size={14} />, onSelect: () => player.addToQueue([track.id]) },
    { key: 'next', label: 'Play next', icon: <SkipForwardIcon size={14} />, onSelect: () => player.playNext([track.id]) },
    { key: 'sep', separator: true },
    { key: 'playlists-header', header: true, label: 'Add to playlist' },
    ...data.playlists.slice(0, 8).map<MenuEntry>((playlist) => ({
      key: playlist.id,
      label: playlist.name,
      icon: <QueueIcon size={14} />,
      onSelect: () => void data.addToPlaylist(playlist.id, [track.id])
    })),
    { key: 'new', label: 'New playlist…', icon: <PlusIcon size={14} />, onSelect: () => ui.openModal({ kind: 'create-playlist', trackIds: [track.id] }) }
  ]

  return (
    <div className="view">
      <div className="now-playing">
        <div className="np-art">
          <Artwork artworkId={track.artworkId} seed={track.album || track.title} iconSize={64} />
        </div>

        <div className="np-info">
          <span className="view-eyebrow">Now playing</span>
          <h1 className="np-title">{track.title}</h1>
          <div className="np-artist">{displayArtist(track)}</div>
          <div className="np-meta">
            {track.album ? <span className="badge">{track.album}</span> : null}
            {track.year ? <span className="badge">{track.year}</span> : null}
            <span className="badge">{formatDuration(track.durationMs)}</span>
            {track.codec ? <span className="badge">{track.codec.toUpperCase()}</span> : null}
            {track.lossless ? <span className="badge badge-accent">Lossless</span> : null}
            {track.issues.length > 0 ? <span className="badge badge-warn">{track.issues.join(', ')}</span> : null}
          </div>

          <div className="np-transport">
            <button
              type="button"
              className={`btn-icon btn-icon-sm ${state?.queue.shuffle ? 'is-active' : ''}`}
              aria-label="Shuffle"
              aria-pressed={state?.queue.shuffle ?? false}
              onClick={() => player.setShuffle(!(state?.queue.shuffle ?? false))}
            >
              <ShuffleIcon size={17} />
            </button>
            <button type="button" className="btn-icon" aria-label="Previous track" onClick={player.previous}>
              <SkipBackIcon size={20} />
            </button>
            <button type="button" className="play-button" style={{ width: 54, height: 54 }} aria-label={isPlaying ? 'Pause' : 'Play'} onClick={player.toggle}>
              {state?.status === 'loading' ? <span className="spinner" /> : isPlaying ? <PauseIcon size={20} /> : <PlayIcon size={22} />}
            </button>
            <button type="button" className="btn-icon" aria-label="Next track" onClick={player.next}>
              <SkipForwardIcon size={20} />
            </button>
            <button
              type="button"
              className={`btn-icon btn-icon-sm ${repeat !== 'off' ? 'is-active' : ''}`}
              aria-label={`Repeat: ${repeat}`}
              onClick={player.cycleRepeat}
            >
              {repeat === 'one' ? <RepeatOneIcon size={17} /> : <RepeatIcon size={17} />}
            </button>
            <div className="spacer" />
            <button
              type="button"
              className={`btn-icon ${favorite ? 'is-active' : ''}`}
              aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={favorite}
              onClick={() => void data.toggleFavorite(track.id)}
            >
              <HeartIcon size={19} filled={favorite} />
            </button>
            <DropdownMenu entries={menu} label="Track actions" iconOnly trigger={<MoreIcon size={18} />} />
          </div>

          <div className="np-seek">
            <SeekBar positionMs={state?.positionMs ?? 0} durationMs={state?.durationMs ?? 0} onSeek={(value) => player.seek(value)} />
            <div className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <span className="time tabular" style={{ textAlign: 'left' }}>
                {formatDuration(state?.positionMs ?? 0)}
              </span>
              <span className="time tabular" style={{ textAlign: 'right' }}>
                {formatDuration(state?.durationMs ?? 0)}
              </span>
            </div>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <button type="button" className="btn-icon btn-icon-sm" aria-label={state?.muted ? 'Unmute' : 'Mute'} onClick={player.toggleMute}>
              {state?.muted ? <VolumeMuteIcon size={16} /> : <VolumeIcon size={16} />}
            </button>
            <input
              type="range"
              className="rail"
              min={0}
              max={1}
              step={0.01}
              value={state?.volume ?? 0.8}
              aria-label="Volume"
              style={{ ['--fill' as string]: `${(state?.volume ?? 0.8) * 100}%`, maxWidth: 180 } as CSSProperties}
              onChange={(event) => player.setVolume(Number(event.target.value))}
            />
            <span className="faint" style={{ fontSize: 11 }}>
              {Math.round((state?.volume ?? 0.8) * 100)}%
            </span>
          </div>

          <div className="np-upsell">
            <h3 style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>File details</h3>
            <table className="data-table">
              <tbody>
                <tr>
                  <td style={{ width: 110 }}>Format</td>
                  <td>
                    {(track.codec ?? 'unknown').toUpperCase()}
                    {track.container ? ` · ${track.container}` : ''}
                    {track.bitrate ? ` · ${Math.round(track.bitrate / 1000)} kbps` : ''}
                  </td>
                </tr>
                <tr>
                  <td>Audio</td>
                  <td>
                    {[formatSampleRate(track.sampleRate), track.channels ? `${track.channels} ch` : null, track.lossless ? 'lossless' : null]
                      .filter(Boolean)
                      .join(' · ') || 'Unknown'}
                  </td>
                </tr>
                <tr>
                  <td>Size</td>
                  <td>
                    {formatFileSize(track.fileSize)} · {formatLongDuration(track.durationMs)}
                  </td>
                </tr>
                <tr>
                  <td>Path</td>
                  <td className="mono" style={{ overflowWrap: 'anywhere' }}>
                    {track.path}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {upcoming.length > 0 ? (
            <div className="np-next">
              <h3>Next in queue</h3>
              {upcoming.map((item, offset) => (
                <button
                  type="button"
                  key={`${item.id}-${offset}`}
                  className="np-next-item"
                  onClick={() => player.jumpToQueueIndex(currentIndex + 1 + offset)}
                >
                  <div className="queue-item-thumb">
                    <Artwork artworkId={item.artworkId} seed={item.album || item.title} iconSize={14} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="queue-item-title">{item.title}</div>
                    <div className="queue-item-sub">{displayArtist(item)}</div>
                  </div>
                  <span className="track-duration tabular">{formatDuration(item.durationMs)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
