import { useMemo, type ReactElement } from 'react'
import { formatCount } from '@core/format'
import { displayArtist } from '@core/models'
import { sortAlbumTracks } from '@core/search'
import { AlbumCard } from '../components/AlbumCard'
import { ArtworkFallback } from '../components/Artwork'
import { EmptyState } from '../components/EmptyState'
import { PersonIcon, PlayIcon, ShuffleIcon } from '../components/Icons'
import { TrackList } from '../components/TrackList'
import { useData } from '../state/data'
import { usePlayerActions } from '../state/player'
import { useUi } from '../state/ui'

export function ArtistView({ name }: { name: string }): ReactElement {
  const data = useData()
  const ui = useUi()
  const player = usePlayerActions()

  const artist = data.artists.find((entry) => entry.name === name)
  const albums = useMemo(() => data.albums.filter((album) => album.artist === name), [data.albums, name])
  const tracks = useMemo(() => {
    const own = data.tracks.filter((track) => displayArtist(track) === name)
    return sortAlbumTracks(own)
  }, [data.tracks, name])

  if (!artist) {
    return (
      <div className="view">
        <EmptyState
          icon={<PersonIcon size={24} />}
          title="Artist not found"
          message="No tracks by this artist are in the library right now."
        >
          <button type="button" className="btn" onClick={() => ui.navigate({ name: 'music' })}>
            Back to music
          </button>
        </EmptyState>
      </div>
    )
  }

  const ids = tracks.map((track) => track.id)

  return (
    <div className="view">
      <div className="artist-hero">
        <div className="artist-avatar">
          <ArtworkFallback seed={artist.name} iconSize={36} />
        </div>
        <div style={{ minWidth: 0 }}>
          <span className="view-eyebrow">Artist</span>
          <h1 style={{ fontSize: 'clamp(26px, 3vw, 40px)' }}>{artist.name}</h1>
          <p className="view-subtitle">
            {formatCount(artist.trackCount, 'track')} · {formatCount(artist.albumCount, 'album')}
          </p>
          <div className="view-actions" style={{ marginLeft: 0, marginTop: 16 }}>
            <button type="button" className="btn btn-primary" onClick={() => player.playTracks(ids, ids[0])}>
              <PlayIcon size={15} /> Play
            </button>
            <button type="button" className="btn" onClick={() => player.shuffleAndPlay(ids)}>
              <ShuffleIcon size={15} /> Shuffle
            </button>
          </div>
        </div>
      </div>

      {albums.length > 0 ? (
        <section className="section" style={{ marginTop: 34 }}>
          <div className="section-header">
            <h2>Albums</h2>
          </div>
          <div className="album-grid">
            {albums.map((album) => (
              <AlbumCard key={album.key} album={album} onOpen={() => ui.navigate({ name: 'album', key: album.key })} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="section-header">
          <h2>Tracks</h2>
        </div>
        <TrackList tracks={tracks} contextIds={ids} />
      </section>
    </div>
  )
}
