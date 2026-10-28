import { useMemo, type ReactElement } from 'react'
import { formatCount, formatLongDuration } from '@core/format'
import { sortAlbumTracks } from '@core/search'
import { Artwork } from '../components/Artwork'
import { DropdownMenu, type MenuEntry } from '../components/DropdownMenu'
import { EmptyState } from '../components/EmptyState'
import { DiscIcon, MoreIcon, PlayIcon, QueueIcon, ShuffleIcon } from '../components/Icons'
import { TrackList } from '../components/TrackList'
import { useData } from '../state/data'
import { usePlayerActions } from '../state/player'
import { useUi } from '../state/ui'

export function AlbumView({ albumKey: key }: { albumKey: string }): ReactElement {
  const data = useData()
  const ui = useUi()
  const player = usePlayerActions()

  const album = data.albums.find((entry) => entry.key === key)
  const tracks = useMemo(() => {
    if (!album) return []
    const found = album.trackIds.map((id) => data.tracksById.get(id)).filter((track) => Boolean(track))
    return sortAlbumTracks(found as NonNullable<(typeof found)[number]>[])
  }, [album, data.tracksById])

  if (!album) {
    return (
      <div className="view">
        <EmptyState
          icon={<DiscIcon size={24} />}
          title="Album not found"
          message="This album is no longer in the library. Rescanning the folder or importing it again will bring it back."
        >
          <button type="button" className="btn" onClick={() => ui.navigate({ name: 'music' })}>
            Back to music
          </button>
        </EmptyState>
      </div>
    )
  }

  const ids = tracks.map((track) => track.id)
  const totalMs = tracks.reduce((sum, track) => sum + track.durationMs, 0)

  const menu: MenuEntry[] = [
    { key: 'queue', label: 'Add album to queue', icon: <QueueIcon size={14} />, onSelect: () => player.addToQueue(ids) },
    { key: 'next', label: 'Play album next', icon: <PlayIcon size={14} />, onSelect: () => player.playNext(ids) },
    { key: 'sep', separator: true },
    {
      key: 'artist',
      label: 'Go to artist',
      onSelect: () => ui.navigate({ name: 'artist', artist: album.artist })
    }
  ]

  return (
    <div className="view">
      <div className="album-hero">
        <div className="album-hero-art">
          <Artwork artworkId={album.artworkId} seed={`${album.title}-${album.artist}`} iconSize={52} />
        </div>
        <div className="album-hero-text">
          <span className="view-eyebrow">Album</span>
          <h1>{album.title}</h1>
          <button type="button" className="album-hero-artist" onClick={() => ui.navigate({ name: 'artist', artist: album.artist })}>
            {album.artist}
          </button>
          <p className="view-subtitle">
            {album.year ? `${album.year} · ` : ''}
            {formatCount(tracks.length, 'track')} · {formatLongDuration(totalMs)}
          </p>
          <div className="view-actions" style={{ marginLeft: 0, marginTop: 18 }}>
            <button type="button" className="btn btn-primary" onClick={() => player.playTracks(ids, ids[0])}>
              <PlayIcon size={15} /> Play
            </button>
            <button type="button" className="btn" onClick={() => player.shuffleAndPlay(ids)}>
              <ShuffleIcon size={15} /> Shuffle
            </button>
            <DropdownMenu entries={menu} label="Album actions" iconOnly trigger={<MoreIcon size={16} />} />
          </div>
        </div>
      </div>

      <div style={{ marginTop: 28 }}>
        <TrackList tracks={tracks} contextIds={ids} />
      </div>
    </div>
  )
}
