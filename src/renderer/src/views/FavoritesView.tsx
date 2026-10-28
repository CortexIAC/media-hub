import { useMemo, type ReactElement } from 'react'
import { formatCount } from '@core/format'
import { PlayIcon, ShuffleIcon } from '../components/Icons'
import { TrackList } from '../components/TrackList'
import { useData } from '../state/data'
import { usePlayerActions } from '../state/player'

export function FavoritesView(): ReactElement {
  const data = useData()
  const player = usePlayerActions()

  const tracks = useMemo(() => data.tracks.filter((track) => data.favorites.has(track.id)), [data.tracks, data.favorites])
  const ids = tracks.map((track) => track.id)

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-header-text">
          <span className="view-eyebrow">Collection</span>
          <h1>Favorites</h1>
          <p className="view-subtitle">
            {tracks.length > 0 ? formatCount(tracks.length, 'favorite track') : 'Tracks you favorite are collected here.'}
          </p>
        </div>
        <div className="view-actions">
          {ids.length > 0 ? (
            <>
              <button type="button" className="btn btn-primary" onClick={() => player.playTracks(ids, ids[0])}>
                <PlayIcon size={15} /> Play
              </button>
              <button type="button" className="btn" onClick={() => player.shuffleAndPlay(ids)}>
                <ShuffleIcon size={15} /> Shuffle
              </button>
            </>
          ) : null}
        </div>
      </div>

      <TrackList
        tracks={tracks}
        contextIds={ids}
        virtualized={tracks.length > 30}
        emptyTitle="No favorites yet"
        emptyMessage="Press the heart on any track — in a list, the player bar or Now Playing — and it will show up here."
      />
    </div>
  )
}
