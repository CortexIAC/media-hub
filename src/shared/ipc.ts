/**
 * IPC contract shared by the main process, the preload bridge and the renderer.
 * Types only — this module is imported by both sides, so it must not pull in
 * Electron or Node at runtime.
 */
import type {
  AppSettings,
  LibrarySnapshot,
  PlaybackSession,
  Playlist,
  ScanProgress,
  ScanSummary,
  Track
} from '@core/models'
import type { DiscoveryKind, DiscoveryResponse } from '@core/discovery'
import type { ProviderDescriptor } from '@core/providers'

export const IPC = {
  libraryGet: 'library:get',
  libraryImportFolder: 'library:import-folder',
  libraryRescan: 'library:rescan',
  libraryRemoveFolder: 'library:remove-folder',
  libraryCancelScan: 'library:cancel-scan',
  libraryVerify: 'library:verify',
  libraryProgress: 'library:progress',
  libraryChanged: 'library:changed',

  playlistsGet: 'playlists:get',
  playlistsCreate: 'playlists:create',
  playlistsRename: 'playlists:rename',
  playlistsRemove: 'playlists:remove',
  playlistsAddTracks: 'playlists:add-tracks',
  playlistsRemoveTrack: 'playlists:remove-track',
  playlistsReorder: 'playlists:reorder',
  favoritesToggle: 'favorites:toggle',
  playlistsChanged: 'playlists:changed',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',

  sessionGet: 'session:get',
  sessionSave: 'session:save',

  mediaResolveTrack: 'media:resolve-track',
  appInfo: 'app:info',
  appOpenDataDir: 'app:open-data-dir',
  appOpenExternal: 'app:open-external',
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  providersList: 'providers:list',
  discoverySearch: 'discovery:search',
  lyricsGet: 'lyrics:get'
} as const

export interface ImportResult {
  cancelled: boolean
  folderId?: string
  summary?: ScanSummary
  error?: string
}

export interface VerifyResult {
  checked: number
  missing: number
}

export interface ResolvedTrackSource {
  url: string
  durationHintMs: number
}

export interface AppInfo {
  name: string
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  dataDir: string
  artworkDir: string
}

export interface PlaylistState {
  playlists: Playlist[]
  favorites: string[]
}

export interface LibraryViewState extends LibrarySnapshot {
  scanning: ScanProgress | null
}

export interface LyricsResult {
  text: string
  synced: boolean
  source: 'local' | 'lrclib'
  provider: string | null
  providerUrl: string | null
}

export interface BunnyApi {
  library: {
    get(): Promise<LibraryViewState>
    importFolder(): Promise<ImportResult>
    rescan(folderId: string): Promise<ImportResult>
    removeFolder(folderId: string): Promise<{ removedTracks: number }>
    cancelScan(): Promise<void>
    verify(): Promise<VerifyResult>
    onProgress(callback: (progress: ScanProgress | null) => void): () => void
    onChanged(callback: (state: LibraryViewState) => void): () => void
  }
  playlists: {
    get(): Promise<PlaylistState>
    create(name: string, trackIds?: string[]): Promise<Playlist>
    rename(id: string, name: string): Promise<Playlist>
    remove(id: string): Promise<void>
    addTracks(id: string, trackIds: string[]): Promise<Playlist>
    removeTrack(id: string, trackId: string): Promise<Playlist>
    reorder(id: string, from: number, to: number): Promise<Playlist>
    toggleFavorite(trackId: string): Promise<boolean>
    onChanged(callback: (state: PlaylistState) => void): () => void
  }
  settings: {
    get(): Promise<AppSettings>
    update(patch: Partial<AppSettings>): Promise<AppSettings>
  }
  session: {
    get(): Promise<PlaybackSession | null>
    save(session: PlaybackSession): Promise<void>
  }
  media: {
    resolveTrack(trackId: string): Promise<ResolvedTrackSource | null>
    trackUrl(trackId: string): string
    artworkUrl(artworkId: string): string
  }
  app: {
    info(): Promise<AppInfo>
    openDataDir(): Promise<void>
    openExternal(url: string): Promise<void>
    minimize(): Promise<void>
    toggleMaximize(): Promise<boolean>
    close(): Promise<void>
    isMaximized(): Promise<boolean>
  }
  providers: {
    list(): Promise<ProviderDescriptor[]>
  }
  discovery: {
    search(query: string, kinds?: DiscoveryKind[]): Promise<DiscoveryResponse>
  }
  lyrics: {
    get(trackId: string): Promise<LyricsResult | null>
  }
}

export type { Track }
