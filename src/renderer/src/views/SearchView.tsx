import { useMemo, type ReactElement } from 'react'
import { formatCount } from '@core/format'
import { normalizeText, searchTracks } from '@core/search'
import { DiscoveryRow } from '../components/DiscoveryRow'
import { AlbumCard } from '../components/AlbumCard'
import { EmptyState } from '../components/EmptyState'
import { PlayIcon, SearchIcon } from '../components/Icons'
import { TrackList } from '../components/TrackList'
import { YouTubeCard } from '../components/YouTubeCard'
import { useData } from '../state/data'
import { useDiscovery } from '../state/discovery'
import { useUi } from '../state/ui'
import { useYouTube, useYouTubeSearch } from '../state/youtube'

const YOUTUBE_RESULTS = 8

/**
 * Global search: local library first, then YouTube (playable straight from the
 * results, in the player that docks to the corner) and the public catalogues.
 */
export function SearchView(): ReactElement {
  const data = useData()
  const ui = useUi()
  const youtube = useYouTube()
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
  const youtubeState = useYouTubeSearch(query)
  const youtubeResults = youtubeState.videos.slice(0, YOUTUBE_RESULTS)

  const searchingOnline = online.status === 'loading' || youtubeState.status === 'loading'

  if (!query) {
    return (
      <div className="view">
        <div className="view-header">
          <div className="view-header-text">
            <span className="view-eyebrow">Search</span>
            <h1>Find something to play</h1>
            <p className="view-subtitle">
              One search field covers your library, YouTube and the public catalogues. YouTube results play straight away in the
              official player.
            </p>
          </div>
        </div>
        <EmptyState
          icon={<SearchIcon size={24} />}
          title="Start typing in the search field"
          message="Use Ctrl+F from anywhere. Search matches track titles, artist and album tags and genre, and also asks YouTube and the Virtual Library catalogues."
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
              ? youtubeResults.length > 0 || onlineResults.length > 0
                ? 'Nothing in your library — results from YouTube and the catalogues are below.'
                : searchingOnline
                  ? 'Nothing in your library yet. Searching YouTube and the catalogues…'
                  : 'Nothing matched anywhere.'
              : `${formatCount(results.tracks.length, 'track')} · ${formatCount(results.albums.length, 'album')} · ${formatCount(results.artists.length, 'artist')} · ${formatCount(results.playlists.length, 'playlist')}`}
          </p>
        </div>
      </div>

      <section className="section">
        <div className="section-header">
          <h2>YouTube</h2>
          {youtubeResults.length > 1 ? (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => youtube.playList(youtubeState.videos)}
              title="Play every result in order, queueing the rest"
            >
              <PlayIcon size={12} /> Play all
            </button>
          ) : null}
        </div>
        {youtubeResults.length > 0 ? (
          <div className="yt-grid">
            {youtubeResults.map((video) => (
              <YouTubeCard
                key={video.id}
                video={video}
                favorite={youtube.favoriteIds.has(video.id)}
                playing={youtube.current?.id === video.id && youtube.playerState === 'playing'}
                onPlay={() => youtube.play(video)}
                onPlayNext={() => youtube.playNextUp(video)}
                onEnqueue={() => youtube.enqueue(video)}
                onToggleFavorite={() => youtube.toggleFavorite(video)}
              />
            ))}
          </div>
        ) : youtubeState.status === 'loading' ? (
          <p className="faint">Searching YouTube…</p>
        ) : youtubeState.status === 'error' ? (
          <p className="faint">
            YouTube search failed: {youtubeState.error}. You can still paste a video link on the Video screen.
          </p>
        ) : (
          <p className="faint">No YouTube matches for “{query}”.</p>
        )}
      </section>

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
            <h2>Your tracks</h2>
          </div>
          <TrackList tracks={results.tracks} contextIds={results.tracks.map((track) => track.id)} />
        </section>
      ) : null}

      <section className="section">
        <div className="section-header">
          <h2>Books & archives</h2>
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

      {total === 0 && onlineResults.length === 0 && youtubeResults.length === 0 && !searchingOnline ? (
        <EmptyState
          icon={<SearchIcon size={24} />}
          title="No results anywhere"
          message="Try a shorter query. Searching covers your library, YouTube and the public catalogues."
        >
          <button type="button" className="btn" onClick={() => void data.importFolder()}>
            Import folder
          </button>
        </EmptyState>
      ) : null}
    </div>
  )
}
