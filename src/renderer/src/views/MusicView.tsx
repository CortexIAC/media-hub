import { useMemo, type ReactElement } from 'react'
import { formatCount, formatLongDuration } from '@core/format'
import { AlbumCard } from '../components/AlbumCard'
import { EmptyState } from '../components/EmptyState'
import { FolderIcon, ImportIcon, MusicIcon, ShuffleIcon } from '../components/Icons'
import { ScanBanner } from '../components/ScanBanner'
import { TrackList } from '../components/TrackList'
import { useData } from '../state/data'
import { usePlayerActions } from '../state/player'
import { useUi } from '../state/ui'

export function MusicView(): ReactElement {
  const data = useData()
  const ui = useUi()
  const player = usePlayerActions()

  const recentAlbums = useMemo(() => {
    return [...data.albums]
      .map((album) => ({
        album,
        latest: Math.max(...album.trackIds.map((id) => data.tracksById.get(id)?.addedAt ?? 0))
      }))
      .sort((a, b) => b.latest - a.latest)
      .slice(0, 10)
      .map((entry) => entry.album)
  }, [data.albums, data.tracksById])

  const recentTracks = useMemo(
    () => [...data.tracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, 12),
    [data.tracks]
  )

  const totalMs = useMemo(() => data.tracks.reduce((sum, track) => sum + track.durationMs, 0), [data.tracks])
  const allIds = useMemo(() => data.tracks.map((track) => track.id), [data.tracks])

  return (
    <div className="view">
      <ScanBanner />

      <div className="view-header">
        <div className="view-header-text">
          <span className="view-eyebrow">{data.folders.length === 0 ? 'Local library' : 'Music library'}</span>
          <h1>Music</h1>
          <p className="view-subtitle">
            {data.tracks.length > 0
              ? `${formatCount(data.tracks.length, 'track')} · ${formatCount(data.albums.length, 'album')} · ${formatCount(data.artists.length, 'artist')} · ${formatLongDuration(totalMs)}`
              : 'Import a folder of audio files to build your local library. Everything plays from this machine.'}
          </p>
        </div>
        <div className="view-actions">
          {allIds.length > 0 ? (
            <>
              <button type="button" className="btn" onClick={() => player.shuffleAndPlay(allIds)}>
                <ShuffleIcon size={15} /> Shuffle all
              </button>
              <button type="button" className="btn" onClick={() => player.playTracks(allIds, allIds[0])}>
                Play all
              </button>
            </>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={() => void data.importFolder()} disabled={data.scanning !== null}>
            <ImportIcon size={15} /> Import folder
          </button>
        </div>
      </div>

      {data.tracks.length === 0 ? (
        data.folders.length === 0 ? (
          <EmptyState
            icon={<MusicIcon size={24} />}
            title="Your music library is empty"
            message="Import a folder and Bunny Media Hub will scan it, read tags and cover art, and play the files with the system audio engine. MP3, M4A/AAC, FLAC, WAV, OGG, Opus and WebM are attempted; anything that fails is reported rather than hidden."
          >
            <button type="button" className="btn btn-primary" onClick={() => void data.importFolder()}>
              <ImportIcon size={15} /> Import a music folder
            </button>
          </EmptyState>
        ) : (
          <EmptyState
            icon={<FolderIcon size={24} />}
            title="No playable tracks found"
            message={`The folder${data.folders.length > 1 ? 's are' : ' is'} in the library, but no supported audio files were found. Most music folders include MP3, FLAC or M4A files.`}
          >
            <button
              type="button"
              className="btn"
              onClick={() => {
                const folder = data.folders[0]
                if (folder) void data.rescanFolder(folder.id)
              }}
            >
              Rescan library
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void data.importFolder()}>
              <ImportIcon size={15} /> Import another folder
            </button>
          </EmptyState>
        )
      ) : (
        <>
          {recentAlbums.length > 0 ? (
            <section className="section">
              <div className="section-header">
                <h2>Recently added</h2>
                <button type="button" className="section-link" onClick={() => ui.navigate({ name: 'library' })}>
                  View library
                </button>
              </div>
              <div className="album-grid">
                {recentAlbums.map((album) => (
                  <AlbumCard key={album.key} album={album} onOpen={() => ui.navigate({ name: 'album', key: album.key })} />
                ))}
              </div>
            </section>
          ) : null}

          {data.artists.length > 0 ? (
            <section className="section">
              <div className="section-header">
                <h2>Artists</h2>
              </div>
              <div className="artist-chips">
                {data.artists.slice(0, 14).map((artist) => (
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
              </div>
            </section>
          ) : null}

          <section className="section">
            <div className="section-header">
              <h2>Recently added tracks</h2>
            </div>
            <TrackList tracks={recentTracks} contextIds={allIds} />
          </section>

          <section className="section">
            <div className="section-header">
              <h2>Albums</h2>
              <span className="faint" style={{ fontSize: 12 }}>
                {formatCount(data.albums.length, 'album')}
              </span>
            </div>
            <div className="album-grid">
              {data.albums.map((album) => (
                <AlbumCard key={album.key} album={album} onOpen={() => ui.navigate({ name: 'album', key: album.key })} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
