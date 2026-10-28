import type { ReactElement } from 'react'
import { formatCount } from '@core/format'
import { useData } from '../state/data'
import { useUi } from '../state/ui'
import {
  ArchiveIcon,
  BookIcon,
  DevicesIcon,
  HeartIcon,
  LibraryIcon,
  MusicIcon,
  PlusIcon,
  QueueIcon,
  SettingsIcon,
  StreamsIcon,
  VideoIcon
} from './Icons'

export function Sidebar(): ReactElement {
  const ui = useUi()
  const data = useData()
  const route = ui.route

  const isActive = (name: string): boolean => {
    if (route.name === name) return true
    if (name === 'music' && (route.name === 'album' || route.name === 'artist')) return true
    if (name === 'library' && route.name === 'favorites') return true
    return false
  }

  return (
    <nav className="sidebar" aria-label="Main">
      <div className="sidebar-brand">
        <div className="brand-mark" style={{ width: 26, height: 26, borderRadius: 8 }}>
          <MusicIcon size={14} />
        </div>
        <div className="sidebar-brand-text">
          <strong>Bunny Media</strong>
          <span>Hub · Sprint 1</span>
        </div>
      </div>

      <button type="button" className={`nav-item ${isActive('music') ? 'active' : ''}`} onClick={() => ui.navigate({ name: 'music' })}>
        <span className="nav-icon"><MusicIcon size={16} /></span>
        <span className="nav-label">Music</span>
        <span className="nav-count">{data.tracks.length > 0 ? data.tracks.length.toLocaleString() : ''}</span>
      </button>
      <button type="button" className={`nav-item ${isActive('video') ? 'active' : ''}`} onClick={() => ui.navigate({ name: 'video' })}>
        <span className="nav-icon"><VideoIcon size={16} /></span>
        <span className="nav-label">Video</span>
      </button>
      <button type="button" className={`nav-item ${isActive('streams') ? 'active' : ''}`} onClick={() => ui.navigate({ name: 'streams' })}>
        <span className="nav-icon"><StreamsIcon size={16} /></span>
        <span className="nav-label">Streams</span>
      </button>
      <button type="button" className={`nav-item ${isActive('archive') ? 'active' : ''}`} onClick={() => ui.navigate({ name: 'archive' })}>
        <span className="nav-icon"><ArchiveIcon size={16} /></span>
        <span className="nav-label">Archive</span>
      </button>
      <button
        type="button"
        className={`nav-item ${isActive('virtual-library') ? 'active' : ''}`}
        onClick={() => ui.navigate({ name: 'virtual-library' })}
      >
        <span className="nav-icon">
          <BookIcon size={16} />
        </span>
        <span className="nav-label">Virtual Library</span>
      </button>
      <button type="button" className={`nav-item ${isActive('library') ? 'active' : ''}`} onClick={() => ui.navigate({ name: 'library' })}>
        <span className="nav-icon"><LibraryIcon size={16} /></span>
        <span className="nav-label">Library</span>
        <span className="nav-count">{data.folders.length > 0 ? data.folders.length : ''}</span>
      </button>
      <button type="button" className={`nav-item ${isActive('devices') ? 'active' : ''}`} onClick={() => ui.navigate({ name: 'devices' })}>
        <span className="nav-icon"><DevicesIcon size={16} /></span>
        <span className="nav-label">Devices</span>
      </button>

      <div className="nav-section-label">Collection</div>

      <button
        type="button"
        className={`nav-item ${isActive('favorites') ? 'active' : ''}`}
        onClick={() => ui.navigate({ name: 'favorites' })}
      >
        <span className="nav-icon"><HeartIcon size={16} filled={route.name === 'favorites'} /></span>
        <span className="nav-label">Favorites</span>
        <span className="nav-count">{data.favorites.size > 0 ? data.favorites.size : ''}</span>
      </button>

      <div className="sidebar-playlists">
        <button
          type="button"
          className="nav-item"
          onClick={() => ui.openModal({ kind: 'create-playlist', trackIds: [] })}
          title="Create playlist"
        >
          <span className="nav-icon"><PlusIcon size={16} /></span>
          <span className="nav-label">New playlist</span>
        </button>
        {data.playlists.map((playlist) => (
          <button
            type="button"
            key={playlist.id}
            className={`nav-item sidebar-playlist ${route.name === 'playlist' && route.id === playlist.id ? 'active' : ''}`}
            onClick={() => ui.navigate({ name: 'playlist', id: playlist.id })}
            title={playlist.name}
          >
            <span className="nav-icon"><QueueIcon size={14} /></span>
            <span className="nav-label truncate">{playlist.name}</span>
            <span className="nav-count">{playlist.trackIds.length || ''}</span>
          </button>
        ))}
        {data.playlists.length === 0 ? (
          <p className="faint" style={{ fontSize: 11, padding: '4px 28px', lineHeight: 1.5 }}>
            Playlists you create will appear here.
          </p>
        ) : null}
      </div>

      <div className="sidebar-footer">
        <button
          type="button"
          className={`nav-item ${route.name === 'settings' ? 'active' : ''}`}
          onClick={() => ui.navigate({ name: 'settings' })}
        >
          <span className="nav-icon"><SettingsIcon size={16} /></span>
          <span className="nav-label">Settings</span>
        </button>
        <div className="sidebar-status">
          <strong>
            {formatCount(data.tracks.length, 'track')} · {formatCount(data.albums.length, 'album')}
          </strong>
          <span>
            {data.scanning
              ? `Scanning… ${data.scanning.tracksFound} found`
              : data.folders.length === 0
                ? 'No folders imported'
                : 'Local library · offline'}
          </span>
        </div>
      </div>
    </nav>
  )
}
