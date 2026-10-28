import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type BunnyApi } from '@shared/ipc'

function subscribe<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, value: T): void => callback(value)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: BunnyApi = {
  library: {
    get: () => ipcRenderer.invoke(IPC.libraryGet),
    importFolder: () => ipcRenderer.invoke(IPC.libraryImportFolder),
    rescan: (folderId) => ipcRenderer.invoke(IPC.libraryRescan, folderId),
    removeFolder: (folderId) => ipcRenderer.invoke(IPC.libraryRemoveFolder, folderId),
    cancelScan: () => ipcRenderer.invoke(IPC.libraryCancelScan),
    verify: () => ipcRenderer.invoke(IPC.libraryVerify),
    onProgress: (callback) => subscribe(IPC.libraryProgress, callback),
    onChanged: (callback) => subscribe(IPC.libraryChanged, callback)
  },
  playlists: {
    get: () => ipcRenderer.invoke(IPC.playlistsGet),
    create: (name, trackIds) => ipcRenderer.invoke(IPC.playlistsCreate, name, trackIds),
    rename: (id, name) => ipcRenderer.invoke(IPC.playlistsRename, id, name),
    remove: (id) => ipcRenderer.invoke(IPC.playlistsRemove, id),
    addTracks: (id, trackIds) => ipcRenderer.invoke(IPC.playlistsAddTracks, id, trackIds),
    removeTrack: (id, trackId) => ipcRenderer.invoke(IPC.playlistsRemoveTrack, id, trackId),
    reorder: (id, from, to) => ipcRenderer.invoke(IPC.playlistsReorder, id, from, to),
    toggleFavorite: (trackId) => ipcRenderer.invoke(IPC.favoritesToggle, trackId),
    onChanged: (callback) => subscribe(IPC.playlistsChanged, callback)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch)
  },
  session: {
    get: () => ipcRenderer.invoke(IPC.sessionGet),
    save: (session) => ipcRenderer.invoke(IPC.sessionSave, session)
  },
  media: {
    resolveTrack: (trackId) => ipcRenderer.invoke(IPC.mediaResolveTrack, trackId),
    trackUrl: (trackId) => `bunny-media://track/${encodeURIComponent(trackId)}`,
    artworkUrl: (artworkId) => `bunny-media://artwork/${encodeURIComponent(artworkId)}`
  },
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
    openDataDir: () => ipcRenderer.invoke(IPC.appOpenDataDir),
    openExternal: (url) => ipcRenderer.invoke(IPC.appOpenExternal, url),
    minimize: () => ipcRenderer.invoke(IPC.windowMinimize),
    toggleMaximize: () => ipcRenderer.invoke(IPC.windowToggleMaximize),
    close: () => ipcRenderer.invoke(IPC.windowClose),
    isMaximized: () => ipcRenderer.invoke(IPC.windowIsMaximized),
    onWindowVisibility: (callback) => subscribe(IPC.windowVisibility, callback)
  },
  providers: {
    list: () => ipcRenderer.invoke(IPC.providersList)
  },
  discovery: {
    search: (query, kinds) => ipcRenderer.invoke(IPC.discoverySearch, query, kinds)
  },
  lyrics: {
    get: (trackId) => ipcRenderer.invoke(IPC.lyricsGet, trackId)
  },
  youtube: {
    search: (query) => ipcRenderer.invoke(IPC.youtubeSearch, query),
    resolve: (input) => ipcRenderer.invoke(IPC.youtubeResolve, input),
    state: () => ipcRenderer.invoke(IPC.youtubeState),
    toggleFavorite: (video) => ipcRenderer.invoke(IPC.youtubeToggleFavorite, video),
    addHistory: (video) => ipcRenderer.invoke(IPC.youtubeHistoryAdd, video)
  },
  streams: {
    state: () => ipcRenderer.invoke(IPC.streamsState),
    add: (url, name) => ipcRenderer.invoke(IPC.streamsAdd, url, name),
    remove: (id) => ipcRenderer.invoke(IPC.streamsRemove, id),
    rename: (id, name) => ipcRenderer.invoke(IPC.streamsRename, id, name),
    markPlayed: (id) => ipcRenderer.invoke(IPC.streamsMarkPlayed, id),
    openExternal: (url) => ipcRenderer.invoke(IPC.streamsOpenExternal, url)
  }
}

contextBridge.exposeInMainWorld('bunny', api)
