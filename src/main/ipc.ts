import { promises as fs } from 'node:fs'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { AppSettings, PlaybackSession, ScanProgress } from '@core/models'
import { PROVIDER_CATALOG } from '@core/providers'
import { IPC, type AppInfo, type ImportResult, type LibraryViewState, type LyricsResult, type ResolvedTrackSource, type VerifyResult } from '@shared/ipc'
import type { LibraryStore } from './storage/libraryStore'
import type { PlaylistStore } from './storage/playlistStore'
import type { SessionStore, SettingsStore } from './storage/sessionStore'
import type { DataPaths } from './storage/paths'
import type { ScannerService } from './library/scannerService'
import { trackUrl } from './mediaProtocol'
import { searchCatalogues } from './providers'
import { fetchLyrics } from './providers/lyrics'
import type { DiscoveryKind } from '@core/discovery'

export interface IpcContext {
  getWindow: () => BrowserWindow | null
  library: LibraryStore
  playlists: PlaylistStore
  settings: SettingsStore
  session: SessionStore
  scanner: ScannerService
  paths: DataPaths
  getProgress: () => ScanProgress | null
  scanFolder: (folderId: string, folderPath: string) => Promise<ImportResult>
  broadcastLibrary: () => void
  broadcastPlaylists: () => void
}

export function buildLibraryState(context: IpcContext): LibraryViewState {
  return { ...context.library.snapshot(), scanning: context.getProgress() }
}

export function registerIpc(context: IpcContext): void {
  const { library, playlists, settings, session, scanner, paths } = context
  const lyricsCache = new Map<string, LyricsResult | null>()

  ipcMain.handle(IPC.libraryGet, () => buildLibraryState(context))

  ipcMain.handle(IPC.libraryImportFolder, async (): Promise<ImportResult> => {
    if (scanner.isScanning) {
      return { cancelled: false, error: 'A library scan is already running. Wait for it to finish.' }
    }
    const window = context.getWindow()
    const result = window
      ? await dialog.showOpenDialog(window, {
          title: 'Import a music folder',
          buttonLabel: 'Import',
          properties: ['openDirectory']
        })
      : await dialog.showOpenDialog({ title: 'Import a music folder', properties: ['openDirectory'] })

    if (result.canceled || result.filePaths.length === 0) return { cancelled: true }
    const folderPath = result.filePaths[0]
    if (!folderPath) return { cancelled: true }

    try {
      const stat = await fs.stat(folderPath)
      if (!stat.isDirectory()) return { cancelled: false, error: 'The selected path is not a folder.' }
    } catch (error) {
      return { cancelled: false, error: `Cannot read that folder: ${messageOf(error)}` }
    }

    const { folder } = library.addFolder(folderPath)
    await library.flush()
    context.broadcastLibrary()
    return context.scanFolder(folder.id, folder.path)
  })

  ipcMain.handle(IPC.libraryRescan, async (_event, folderId: string): Promise<ImportResult> => {
    if (scanner.isScanning) {
      return { cancelled: false, error: 'A library scan is already running. Wait for it to finish.' }
    }
    const folder = library.folders.find((entry) => entry.id === folderId)
    if (!folder) return { cancelled: false, error: 'That folder is no longer in the library.' }
    try {
      const stat = await fs.stat(folder.path)
      if (!stat.isDirectory()) throw new Error('not a directory')
    } catch {
      return {
        cancelled: false,
        error: 'That folder is missing or unreadable. Its tracks are kept so you can plug the drive back in.'
      }
    }
    return context.scanFolder(folder.id, folder.path)
  })

  ipcMain.handle(IPC.libraryRemoveFolder, async (_event, folderId: string) => {
    const removed = library.removeFolder(folderId)
    const valid = new Set(library.allTrackIds())
    playlists.prune(valid)
    library.setLastScan(null)
    await Promise.all([library.flush(), playlists.flush()])
    context.broadcastLibrary()
    context.broadcastPlaylists()
    return { removedTracks: removed.length }
  })

  ipcMain.handle(IPC.libraryCancelScan, () => {
    scanner.cancel()
  })

  ipcMain.handle(IPC.libraryVerify, async (): Promise<VerifyResult> => {
    const tracks = library.snapshot().tracks
    let missing = 0
    let checked = 0
    const batchSize = 250
    for (let start = 0; start < tracks.length; start += batchSize) {
      const batch = tracks.slice(start, start + batchSize)
      const results = await Promise.all(
        batch.map(async (track) => {
          checked += 1
          try {
            await fs.access(track.path)
            return true
          } catch {
            return false
          }
        })
      )
      missing += results.filter((ok) => !ok).length
      await new Promise((resolve) => setImmediate(resolve))
    }
    return { checked, missing }
  })

  ipcMain.handle(IPC.playlistsGet, () => playlists.state())

  ipcMain.handle(IPC.playlistsCreate, async (_event, name: string, trackIds?: string[]) => {
    const playlist = playlists.create(name, trackIds)
    await playlists.flush()
    context.broadcastPlaylists()
    return playlist
  })

  ipcMain.handle(IPC.playlistsRename, async (_event, id: string, name: string) => {
    const playlist = playlists.rename(id, name)
    await playlists.flush()
    context.broadcastPlaylists()
    return playlist
  })

  ipcMain.handle(IPC.playlistsRemove, async (_event, id: string) => {
    playlists.remove(id)
    await playlists.flush()
    context.broadcastPlaylists()
  })

  ipcMain.handle(IPC.playlistsAddTracks, async (_event, id: string, trackIds: string[]) => {
    const playlist = playlists.addTracks(id, trackIds)
    await playlists.flush()
    context.broadcastPlaylists()
    return playlist
  })

  ipcMain.handle(IPC.playlistsRemoveTrack, async (_event, id: string, trackId: string) => {
    const playlist = playlists.removeTrack(id, trackId)
    await playlists.flush()
    context.broadcastPlaylists()
    return playlist
  })

  ipcMain.handle(IPC.playlistsReorder, async (_event, id: string, from: number, to: number) => {
    const playlist = playlists.reorder(id, from, to)
    await playlists.flush()
    context.broadcastPlaylists()
    return playlist
  })

  ipcMain.handle(IPC.favoritesToggle, async (_event, trackId: string) => {
    const favorite = playlists.toggleFavorite(trackId)
    await playlists.flush()
    context.broadcastPlaylists()
    return favorite
  })

  ipcMain.handle(IPC.settingsGet, () => settings.value)

  ipcMain.handle(IPC.settingsUpdate, async (_event, patch: Partial<AppSettings>) => {
    const next = settings.update(patch)
    await settings.flush()
    return next
  })

  ipcMain.handle(IPC.sessionGet, (): PlaybackSession | null => session.value)

  ipcMain.handle(IPC.sessionSave, async (_event, value: PlaybackSession) => {
    session.save(value)
  })

  ipcMain.handle(IPC.mediaResolveTrack, async (_event, trackId: string): Promise<ResolvedTrackSource | null> => {
    const track = library.getTrack(trackId)
    if (!track) return null
    try {
      const stat = await fs.stat(track.path)
      if (!stat.isFile()) return null
    } catch {
      return null
    }
    return { url: trackUrl(track.id), durationHintMs: track.durationMs }
  })

  ipcMain.handle(IPC.appInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron ?? 'unknown',
    chrome: process.versions.chrome ?? 'unknown',
    node: process.versions.node,
    platform: process.platform,
    dataDir: paths.root,
    artworkDir: paths.artworkDir
  }))

  ipcMain.handle(IPC.appOpenDataDir, async () => {
    await fs.mkdir(paths.root, { recursive: true })
    await shell.openPath(paths.root)
  })

  ipcMain.handle(IPC.appOpenExternal, async (_event, rawUrl: string) => {
    const url = new URL(String(rawUrl))
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('Only http(s) links can be opened externally.')
    }
    await shell.openExternal(url.toString())
  })

  ipcMain.handle(IPC.windowMinimize, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle(IPC.windowToggleMaximize, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return false
    if (window.isMaximized()) {
      window.unmaximize()
      return false
    }
    window.maximize()
    return true
  })

  ipcMain.handle(IPC.windowIsMaximized, (event) => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false)

  ipcMain.handle(IPC.windowClose, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle(IPC.providersList, () => PROVIDER_CATALOG.map((provider) => ({ ...provider })))

  ipcMain.handle(IPC.discoverySearch, async (_event, query: string, kinds?: DiscoveryKind[]) => {
    if (typeof query !== 'string') throw new Error('A search query is required.')
    return searchCatalogues(query, {
      kinds: Array.isArray(kinds) ? kinds : undefined,
      youtubeApiKey: settings.value.youtubeApiKey
    })
  })

  ipcMain.handle(IPC.lyricsGet, async (_event, trackId: string): Promise<LyricsResult | null> => {
    const track = library.getTrack(trackId)
    if (!track) return null

    if (track.lyrics && track.lyrics.trim().length > 0) {
      return {
        text: track.lyrics,
        synced: /\[\d{1,3}:\d{1,2}/.test(track.lyrics),
        source: 'local',
        provider: track.lyricsSource === 'sidecar' ? 'Sidecar lyrics file' : 'Embedded lyrics tag',
        providerUrl: null
      }
    }

    if (lyricsCache.has(trackId)) return lyricsCache.get(trackId) ?? null
    const online = await fetchLyrics({
      trackName: track.title,
      artistName: track.artist || track.albumArtist,
      albumName: track.album,
      durationMs: track.durationMs
    })
    const result: LyricsResult | null = online
      ? {
          text: online.text,
          synced: online.synced,
          source: 'lrclib',
          provider: online.provider,
          providerUrl: online.providerUrl
        }
      : null
    // Cache misses too: repeated views of the same track should not re-request.
    if (lyricsCache.size > 500) lyricsCache.clear()
    lyricsCache.set(trackId, result)
    return result
  })
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code
    return code ? `${code}: ${error.message}` : error.message
  }
  return String(error)
}
