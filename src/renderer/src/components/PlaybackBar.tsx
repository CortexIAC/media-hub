import type { CSSProperties, ReactElement } from 'react'
import { formatDuration } from '@core/format'
import { displayArtist } from '@core/models'
import { useData } from '../state/data'
import { usePlayerActions, usePlayerState } from '../state/player'
import { useUi } from '../state/ui'
import { Artwork } from './Artwork'
import { SeekBar } from './SeekBar'
import {
  HeartIcon,
  PauseIcon,
  PlayIcon,
  QueueIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  VolumeIcon,
  VolumeMuteIcon
} from './Icons'

export function PlaybackBar(): ReactElement {
  const player = usePlayerActions()
  const state = usePlayerState()
  const data = useData()
  const ui = useUi()

  const track = state?.trackId ? data.tracksById.get(state.trackId) ?? null : null
  const isPlaying = state?.status === 'playing'
  const isLoading = state?.status === 'loading'
  const durationMs = state?.durationMs ?? 0
  const positionMs = state?.positionMs ?? 0
  const hasQueue = (state?.queue.ids.length ?? 0) > 0
  const repeat = state?.queue.repeat ?? 'off'
  const shuffle = state?.queue.shuffle ?? false
  const favorite = track ? data.favorites.has(track.id) : false

  return (
    <footer className="playerbar" aria-label="Playback">
      <div className="playerbar-main">
        <button
          type="button"
          className="now-mini"
          onClick={() => track && ui.navigate({ name: 'now-playing' })}
          aria-label={track ? `Now playing: ${track.title}` : 'Nothing is playing'}
        >
          <div className="now-mini-art">
            <Artwork artworkId={track?.artworkId ?? null} seed={track?.album || 'Bunny Media Hub'} iconSize={18} />
          </div>
          <div className="now-mini-text">
            <div className="now-mini-title">{track ? track.title : 'Nothing playing'}</div>
            <div className="now-mini-sub">
              {track ? displayArtist(track) : data.tracks.length === 0 ? 'Import a music folder to begin' : 'Pick a track to begin'}
            </div>
          </div>
        </button>

        <div className="player-center">
          <div className="transport">
            <button
              type="button"
              className={`btn-icon btn-icon-sm ${shuffle ? 'is-active' : ''}`}
              aria-label="Shuffle"
              aria-pressed={shuffle}
              onClick={() => player.setShuffle(!shuffle)}
            >
              <ShuffleIcon size={15} />
            </button>
            <div className="transport-main">
              <button
                type="button"
                className="btn-icon"
                aria-label="Previous track"
                disabled={!hasQueue}
                onClick={player.previous}
              >
                <SkipBackIcon size={17} />
              </button>
              <button
                type="button"
                className="play-button"
                aria-label={isPlaying ? 'Pause' : 'Play'}
                onClick={player.toggle}
                disabled={!hasQueue}
              >
                {isLoading ? <span className="spinner" /> : isPlaying ? <PauseIcon size={18} /> : <PlayIcon size={19} />}
              </button>
              <button type="button" className="btn-icon" aria-label="Next track" disabled={!hasQueue} onClick={player.next}>
                <SkipForwardIcon size={17} />
              </button>
            </div>
            <button
              type="button"
              className={`btn-icon btn-icon-sm ${repeat !== 'off' ? 'is-active' : ''}`}
              aria-label={`Repeat: ${repeat}`}
              aria-pressed={repeat !== 'off'}
              onClick={player.cycleRepeat}
            >
              {repeat === 'one' ? <RepeatOneIcon size={15} /> : <RepeatIcon size={15} />}
            </button>
          </div>

          <div className="seek-row">
            <span className="time tabular">{formatDuration(positionMs)}</span>
            <SeekBar
              positionMs={positionMs}
              durationMs={durationMs}
              disabled={!track}
              onSeek={(value) => player.seek(value)}
            />
            <span className="time tabular">{formatDuration(durationMs)}</span>
          </div>
        </div>

        <div className="player-right">
          {track ? (
            <button
              type="button"
              className={`btn-icon btn-icon-sm ${favorite ? 'favorite-button is-favorite' : ''}`}
              aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={favorite}
              onClick={() => void data.toggleFavorite(track.id)}
            >
              <HeartIcon size={16} filled={favorite} />
            </button>
          ) : null}
          <button
            type="button"
            className={`btn-icon btn-icon-sm ${ui.queueOpen ? 'is-active' : ''}`}
            aria-label="Queue"
            aria-pressed={ui.queueOpen}
            onClick={ui.toggleQueue}
          >
            <QueueIcon size={17} />
          </button>
          <button
            type="button"
            className="btn-icon btn-icon-sm"
            aria-label={state?.muted ? 'Unmute' : 'Mute'}
            aria-pressed={state?.muted}
            onClick={player.toggleMute}
          >
            {state?.muted ? <VolumeMuteIcon size={16} /> : <VolumeIcon size={16} />}
          </button>
          <div className="volume">
            <input
              type="range"
              className="rail"
              min={0}
              max={1}
              step={0.01}
              value={state?.volume ?? 0.8}
              aria-label="Volume"
              style={{ ['--fill' as string]: `${(state?.volume ?? 0.8) * 100}%` } as CSSProperties}
              onChange={(event) => player.setVolume(Number(event.target.value))}
            />
          </div>
        </div>
      </div>
    </footer>
  )
}

