import { useMemo, useState, type ReactElement } from 'react'
import { formatCount, formatLongDuration, formatRelativeTime } from '@core/format'
import { normalizeText } from '@core/search'
import type { Track } from '@core/models'
import { EmptyState } from '../components/EmptyState'
import {
  AlertIcon,
  FolderIcon,
  ImportIcon,
  LibraryIcon,
  RefreshIcon,
  TrashIcon
} from '../components/Icons'
import { ScanBanner } from '../components/ScanBanner'
import { TrackList } from '../components/TrackList'
import { useData } from '../state/data'
import type { VerifyResult } from '@shared/ipc'

type SortKey = 'added' | 'title' | 'artist' | 'album' | 'duration'

export function LibraryView(): ReactElement {
  const data = useData()
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<SortKey>('added')
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)

  const filtered = useMemo(() => {
    const query = normalizeText(filter)
    const base = query
      ? data.tracks.filter((track) => {
          const haystack = normalizeText(`${track.title} ${track.artist} ${track.albumArtist} ${track.album} ${track.genre ?? ''}`)
          return haystack.includes(query)
        })
      : data.tracks
    return sortTracks(base, sort)
  }, [data.tracks, filter, sort])

  const visible = filtered.slice(0, 500)
  const totalMs = data.tracks.reduce((sum, track) => sum + track.durationMs, 0)
  const lastScan = data.lastScan

  return (
    <div className="view">
      <ScanBanner />

      <div className="view-header">
        <div className="view-header-text">
          <span className="view-eyebrow">Local files</span>
          <h1>Library</h1>
          <p className="view-subtitle">
            Folders, scanning and the full track index. Nothing leaves this machine.
          </p>
        </div>
        <div className="view-actions">
          <button type="button" className="btn" onClick={() => void window.bunny.app.openDataDir()}>
            Open data folder
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={data.scanning !== null}
            onClick={() => void data.importFolder()}
          >
            <ImportIcon size={15} /> Import folder
          </button>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 28 }}>
        <Stat label="Tracks" value={data.tracks.length.toLocaleString()} />
        <Stat label="Albums" value={data.albums.length.toLocaleString()} />
        <Stat label="Artists" value={data.artists.length.toLocaleString()} />
        <Stat label="Folders" value={data.folders.length.toLocaleString()} />
        <Stat label="Play time" value={formatLongDuration(totalMs)} />
        <Stat label="Favorites" value={data.favorites.size.toLocaleString()} />
      </div>

      <section className="section">
        <div className="section-header">
          <h2>Music folders</h2>
          <button type="button" className="section-link" onClick={() => void data.importFolder()} disabled={data.scanning !== null}>
            Add folder
          </button>
        </div>

        {data.folders.length === 0 ? (
          <EmptyState
            icon={<FolderIcon size={24} />}
            title="No folders imported"
            message="Pick a folder containing your music. Subfolders are scanned too, and hidden or system folders are skipped."
          >
            <button type="button" className="btn btn-primary" onClick={() => void data.importFolder()}>
              <ImportIcon size={15} /> Import a folder
            </button>
          </EmptyState>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.folders.map((folder) => {
              const count = data.tracks.filter((track) => track.folderId === folder.id).length
              const scanningThis = data.scanning?.folderId === folder.id
              return (
                <div className="folder-row" key={folder.id}>
                  <span style={{ color: 'var(--text-faint)' }}>
                    <FolderIcon size={18} />
                  </span>
                  <div className="folder-text">
                    <strong style={{ fontSize: 13 }}>{folder.name}</strong>
                    <span className="folder-path">{folder.path}</span>
                  </div>
                  <span className="faint" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                    {formatCount(count, 'track')}
                    {folder.lastScanAt ? ` · scanned ${formatRelativeTime(folder.lastScanAt)}` : ' · not scanned yet'}
                  </span>
                  {scanningThis ? <span className="spinner" /> : null}
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={data.scanning !== null}
                    onClick={() => void data.rescanFolder(folder.id)}
                  >
                    <RefreshIcon size={14} /> Rescan
                  </button>
                  {confirmRemove === folder.id ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          setConfirmRemove(null)
                          void data.removeFolder(folder.id)
                        }}
                      >
                        Confirm
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmRemove(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      aria-label={`Remove ${folder.name} from the library`}
                      onClick={() => setConfirmRemove(folder.id)}
                    >
                      <TrashIcon size={14} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-header">
          <h2>Library health</h2>
        </div>
        <div className="settings-grid">
          <div className="settings-card">
            <h2>File check</h2>
            <p className="card-body" style={{ margin: 0 }}>
              Confirms every indexed file still exists on disk. Missing files stay in the library so a disconnected drive can be
              reattached without re-importing.
            </p>
            <div className="row">
              <button type="button" className="btn btn-sm" onClick={() => void data.verifyLibrary().then(setVerifyResult)}>
                Verify files
              </button>
              {verifyResult ? (
                <span className={verifyResult.missing > 0 ? 'badge badge-warn' : 'badge badge-accent'}>
                  {verifyResult.missing > 0 ? `${verifyResult.missing} missing of ${verifyResult.checked}` : `${verifyResult.checked} files present`}
                </span>
              ) : null}
            </div>
          </div>

          <div className="settings-card">
            <h2>Last scan</h2>
            {lastScan ? (
              <>
                <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <span className="badge badge-accent">{lastScan.tracksAdded} new</span>
                  <span className="badge">{lastScan.tracksUpdated} updated</span>
                  <span className="badge">{lastScan.tracksUnchanged} unchanged</span>
                  {lastScan.tracksRemoved > 0 ? <span className="badge badge-warn">{lastScan.tracksRemoved} removed</span> : null}
                  {lastScan.failures.length > 0 ? <span className="badge badge-danger">{lastScan.failures.length} unreadable</span> : null}
                </div>
                <p className="card-body" style={{ margin: 0 }}>
                  {lastScan.cancelled ? 'Cancelled before finishing. ' : ''}
                  {lastScan.cancelled
                    ? 'Tracks found so far were kept; missing-file cleanup was skipped.'
                    : `Finished ${formatRelativeTime(lastScan.finishedAt)} after scanning ${lastScan.filesSeen.toLocaleString()} files.`}
                  {lastScan.truncated ? ' The file limit was reached; some files were not scanned.' : ''}
                </p>
                {lastScan.skipped.length > 0 ? (
                  <p className="faint" style={{ fontSize: 11.5, margin: 0 }}>
                    Skipped unsupported files: {summariseSkipped(lastScan.skipped)}
                  </p>
                ) : null}
                {lastScan.failures.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {lastScan.failures.slice(0, 4).map((failure) => (
                      <div key={failure.path} className="row" style={{ fontSize: 11, color: 'var(--text-faint)', alignItems: 'flex-start' }}>
                        <AlertIcon size={12} />
                        <span style={{ overflowWrap: 'anywhere' }}>
                          {failure.path.split(/[\\/]/).pop()}: {failure.message}
                        </span>
                      </div>
                    ))}
                    {lastScan.failures.length > 4 ? (
                      <span className="faint" style={{ fontSize: 11 }}>
                        …and {lastScan.failures.length - 4} more.
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="card-body" style={{ margin: 0 }}>
                No scan has run yet. Import a folder to start.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <h2>All tracks</h2>
          <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
            <input
              className="input input-sm"
              style={{ width: 220 }}
              placeholder="Filter this list"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Filter tracks"
            />
            <select className="input input-sm" style={{ width: 150 }} value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="Sort tracks">
              <option value="added">Recently added</option>
              <option value="title">Title</option>
              <option value="artist">Artist</option>
              <option value="album">Album</option>
              <option value="duration">Duration</option>
            </select>
          </div>
        </div>

        {data.tracks.length === 0 ? (
          <EmptyState
            icon={<LibraryIcon size={24} />}
            title="The library is empty"
            message="Import a folder of music to populate the library. Supported containers are listed in Settings."
          >
            <button type="button" className="btn btn-primary" onClick={() => void data.importFolder()}>
              <ImportIcon size={15} /> Import a folder
            </button>
          </EmptyState>
        ) : (
          <>
            <TrackList
              tracks={visible}
              contextIds={filtered.map((track) => track.id)}
              virtualized
              emptyTitle="No matches"
              emptyMessage="Nothing in the library matches that filter."
            />
            {filtered.length > visible.length ? (
              <p className="faint" style={{ fontSize: 11.5, marginTop: 10 }}>
                Showing the first {visible.length} of {filtered.length.toLocaleString()} matching tracks. Refine the filter to narrow
                it down.
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

function sortTracks(tracks: Track[], sort: SortKey): Track[] {
  const copy = [...tracks]
  switch (sort) {
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title))
    case 'artist':
      return copy.sort((a, b) => (a.albumArtist || a.artist).localeCompare(b.albumArtist || b.artist) || a.title.localeCompare(b.title))
    case 'album':
      return copy.sort((a, b) => a.album.localeCompare(b.album) || (a.trackNo ?? 0) - (b.trackNo ?? 0))
    case 'duration':
      return copy.sort((a, b) => b.durationMs - a.durationMs)
    case 'added':
    default:
      return copy.sort((a, b) => b.addedAt - a.addedAt)
  }
}

function summariseSkipped(skipped: Array<{ extension: string }>): string {
  const counts = new Map<string, number>()
  for (const entry of skipped) counts.set(entry.extension, (counts.get(entry.extension) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([extension, count]) => `${extension} ×${count}`)
    .join(', ')
}
