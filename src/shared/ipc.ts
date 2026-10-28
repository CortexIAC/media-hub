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
import type { YouTubeVideo } from '@core/youtube'
import type { StreamKind, StreamSource } from '@core/streams'
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
  windowVisibility: 'window:visibility',
  providersList: 'providers:list',
  discoverySearch: 'discovery:search',
  lyricsGet: 'lyrics:get',

  youtubeSearch: 'youtube:search',
  youtubeResolve: 'youtube:resolve',
  youtubeState: 'youtube:state',
  youtubeToggleFavorite: 'youtube:toggle-favorite',
  youtubeHistoryAdd: 'youtube:history-add',

  streamsState: 'streams:state',
  streamsAdd: 'streams:add',
  streamsAddSuggested: 'streams:add-suggested',
  streamsRemove: 'streams:remove',
  streamsRename: 'streams:rename',
  streamsMarkPlayed: 'streams:mark-played',
  streamsOpenExternal: 'streams:open-external'
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

export interface YouTubeSearchResult {
  videos: YouTubeVideo[]
  /** Kept for older callers; search no longer requires a key. */
  needsKey: boolean
  error: string | null
  /** Which path answered: the user's Data API key, or keyless web search. */
  source?: 'api' | 'web' | null
  warning?: string | null
}

export interface YouTubeResolveResult {
  video: YouTubeVideo | null
  error: string | null
}

export interface YouTubeLibraryView {
  favorites: YouTubeVideo[]
  history: YouTubeVideo[]
}

export interface StreamSourceView extends StreamSource {
  /** Ready-to-use `bunny-stream:` URL; the renderer never builds one itself. */
  playUrl: string
  /** Set when the link cannot be decoded in-app, so the UI can explain why. */
  unsupportedReason: string | null
}

export interface StreamsViewState {
  sources: StreamSourceView[]
}

export interface StreamAddResult {
  ok: boolean
  added: number
  skipped: number
  state: StreamsViewState
  error: string | null
}

export interface StreamExternalResult {
  ok: boolean
  player: 'vlc' | 'system' | null
  error: string | null
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
    /** Fires when the window is minimised/hidden or shown again. */
    onWindowVisibility(callback: (visible: boolean) => void): () => void
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
  youtube: {
    search(query: string): Promise<YouTubeSearchResult>
    resolve(input: string): Promise<YouTubeResolveResult>
    state(): Promise<YouTubeLibraryView>
    toggleFavorite(video: YouTubeVideo): Promise<YouTubeLibraryView>
    addHistory(video: YouTubeVideo): Promise<YouTubeLibraryView>
  }
  streams: {
    state(): Promise<StreamsViewState>
    add(url: string, name?: string): Promise<StreamAddResult>
    addSuggested(): Promise<StreamsViewState>
    remove(id: string): Promise<StreamsViewState>
    rename(id: string, name: string): Promise<StreamsViewState>
    markPlayed(id: string): Promise<StreamsViewState>
    openExternal(url: string): Promise<StreamExternalResult>
  }
}

export type { Track, YouTubeVideo, StreamSource, StreamKind }
