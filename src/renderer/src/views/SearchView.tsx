import { useMemo, type ReactElement } from 'react'
import { formatCount } from '@core/format'
import { normalizeText, searchTracks } from '@core/search'
import { DiscoveryRow } from '../components/DiscoveryRow'
import { AlbumCard } from '../components/AlbumCard'
import { EmptyState } from '../components/EmptyState'
import { SearchIcon } from '../components/Icons'
import { TrackList } from '../components/TrackList'
import { useData } from '../state/data'
import { useDiscovery } from '../state/discovery'
import { useUi } from '../state/ui'

export function SearchView(): ReactElement {
  const data = useData()
  const ui = useUi()
  const query = ui.searchQuery.trim()

  const results = useMemo(() => {
    if (!query) return { tracks: [], albums: [], artists: [], playlists: [] }
    const normalized = normalizeText(query)
    const trackHits = searchTracks(data.tracks, query, 60).map((hit) => hit.track)
    const albums = data.albums
      .filter((album) => normalizeText(album.title).includes(normalized) || normalizeText(album.artist).includes(normalized))
      .slice(0, 12)
    const artists = data.artists.filter((artist) => normalizeText(artist.name).includes(normalized)).slice(0, 12)
    const playlists = data.playlists.filter((playlist) => normalizeText(playlist.name).includes(normalized)).slice(0, 12)
    return { tracks: trackHits, albums, artists, playlists }
  }, [query, data.tracks, data.albums, data.artists, data.playlists])

  const total = results.tracks.length + results.albums.length + results.artists.length + results.playlists.length
  const online = useDiscovery(query)
  const onlineResults = online.data?.results.slice(0, 6) ?? []

  if (!query) {
    return (
      <div className="view">
        <div className="view-header">
          <div className="view-header-text">
            <span className="view-eyebrow">Search</span>
            <h1>Find something to play</h1>
            <p className="view-subtitle">Search matched titles, artists, albums and genres in your local library.</p>
          </div>
        </div>
        <EmptyState
          icon={<SearchIcon size={24} />}
          title="Start typing in the search field"
          message="Use Ctrl+F from anywhere. Search looks at track titles, artist and album tags, and genre."
        >
          <button type="button" className="btn" onClick={() => document.getElementById('global-search')?.focus()}>
            Focus search
          </button>
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-header-text">
          <span className="view-eyebrow">Search</span>
          <h1>“{query}”</h1>
          <p className="view-subtitle">
            {total === 0
              ? onlineResults.length > 0
                ? 'Nothing in your local library — online matches are listed below.'
                : 'Nothing matched.'
              : `${formatCount(results.tracks.length, 'track')} · ${formatCount(results.albums.length, 'album')} · ${formatCount(results.artists.length, 'artist')} · ${formatCount(results.playlists.length, 'playlist')}`}
          </p>
        </div>
      </div>

      {total === 0 && onlineResults.length === 0 ? (
        <EmptyState
          icon={<SearchIcon size={24} />}
          title="No results"
          message="Try a shorter query, or import the folder that contains this music. Online catalogues are searched too, so public-domain books, archive concerts and YouTube (with a key) can appear here."
        >
          <button type="button" className="btn" onClick={() => void data.importFolder()}>
            Import folder
          </button>
        </EmptyState>
      ) : (
        <>
          {results.albums.length > 0 ? (
            <section className="section">
              <div className="section-header">
                <h2>Albums</h2>
              </div>
              <div className="album-grid">
                {results.albums.map((album) => (
                  <AlbumCard key={album.key} album={album} onOpen={() => ui.navigate({ name: 'album', key: album.key })} />
                ))}
              </div>
            </section>
          ) : null}

          {results.artists.length > 0 || results.playlists.length > 0 ? (
            <section className="section">
              <div className="section-header">
                <h2>Artists & playlists</h2>
              </div>
              <div className="artist-chips">
                {results.artists.map((artist) => (
                  <button
                    type="button"
                    key={artist.name}
                    className="artist-chip"
                    onClick={() => ui.navigate({ name: 'artist', artist: artist.name })}
                  >
                    {artist.name}
                    <span className="count">{artist.trackCount}</span>
                  </button>
                ))}
                {results.playlists.map((playlist) => (
                  <button
                    type="button"
                    key={playlist.id}
                    className="artist-chip"
                    onClick={() => ui.navigate({ name: 'playlist', id: playlist.id })}
                  >
                    {playlist.name}
                    <span className="count">{playlist.trackIds.length}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {results.tracks.length > 0 ? (
            <section className="section">
              <div className="section-header">
                <h2>Tracks</h2>
              </div>
              <TrackList tracks={results.tracks} contextIds={results.tracks.map((track) => track.id)} />
            </section>
          ) : null}

          <section className="section">
            <div className="section-header">
              <h2>Online catalogues</h2>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => ui.navigate({ name: 'virtual-library' })}>
                Search the Virtual Library
              </button>
            </div>
            {online.status === 'loading' && onlineResults.length === 0 ? (
              <p className="faint">Searching Open Library, Gutenberg, LibriVox and the Internet Archive…</p>
            ) : onlineResults.length > 0 ? (
              <div className="discovery-list">
                {onlineResults.map((result) => (
                  <DiscoveryRow key={`${result.source}:${result.id}`} result={result} />
                ))}
              </div>
            ) : (
              <p className="faint">
                {online.status === 'error'
                  ? `Catalogue search failed: ${online.error}`
                  : 'No catalogue matches. Public-domain books and archive recordings show up here even when nothing is in your local library.'}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
