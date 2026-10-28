import type { ReactElement } from 'react'
import type { AlbumGroup } from '@core/search'
import { Artwork } from './Artwork'

export function AlbumCard({ album, onOpen }: { album: AlbumGroup; onOpen: () => void }): ReactElement {
  return (
    <button type="button" className="album-card" onClick={onOpen} aria-label={`Open album ${album.title}`}>
      <div className="album-art">
        <Artwork artworkId={album.artworkId} seed={`${album.title}-${album.artist}`} iconSize={30} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="album-title truncate" title={album.title}>
          {album.title}
        </div>
        <div className="album-subtitle truncate" title={album.artist}>
          {album.artist}
          {album.year ? ` · ${album.year}` : ''}
        </div>
      </div>
    </button>
  )
}
