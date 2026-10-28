import { join } from 'node:path'
import { app, BrowserWindow, Menu, session as electronSession, shell } from 'electron'
import type { ScanProgress } from '@core/models'
import { IPC } from '@shared/ipc'
import { registerIpc, buildLibraryState, type IpcContext } from './ipc'
import { ScannerService } from './library/scannerService'
import { registerMediaProtocol, registerMediaScheme, isInternalUrl } from './mediaProtocol'
import { LibraryStore } from './storage/libraryStore'
import { PlaylistStore } from './storage/playlistStore'
import { SessionStore, SettingsStore } from './storage/sessionStore'
import { YouTubeStore } from './storage/youtubeStore'
import { dataPaths, type DataPaths } from './storage/paths'
import { startRendererServer, type RendererServer } from './rendererServer'

app.setName('Bunny Media Hub')
registerMediaScheme()

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let rendererServer: RendererServer | null = null
let paths: DataPaths
let library: LibraryStore
let playlists: PlaylistStore
let settings: SettingsStore
let session: SessionStore
let youtube: YouTubeStore
let scanner: ScannerService
let scheduledScan: NodeJS.Timeout | null = null
let quitting = false
let currentProgress: ScanProgress | null = null
let broadcastTimer: NodeJS.Timeout | null = null

const context: IpcContext = {
  getWindow: () => mainWindow,
  library: undefined as unknown as LibraryStore,
  playlists: undefined as unknown as PlaylistStore,
  settings: undefined as unknown as SettingsStore,
  session: undefined as unknown as SessionStore,
  youtube: undefined as unknown as YouTubeStore,
  scanner: undefined as unknown as ScannerService,
  paths: undefined as unknown as DataPaths,
  getProgress: () => currentProgress,
  scanFolder: async () => ({ cancelled: true }),
  broadcastLibrary: () => undefined,
  broadcastPlaylists: () => undefined
}

if (gotLock) {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(bootstrap).catch((error) => {
    console.error('[main] failed to start', error)
    app.quit()
  })

  app.on('window-all-closed', () => {
    void rendererServer?.close()
    rendererServer = null
    app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    if (scheduledScan) clearTimeout(scheduledScan)
    scanner?.dispose()
    Promise.allSettled([
      library?.flush() ?? Promise.resolve(),
      playlists?.flush() ?? Promise.resolve(),
      settings?.flush() ?? Promise.resolve(),
      session?.flush() ?? Promise.resolve(),
      youtube?.flush() ?? Promise.resolve()
    ]).finally(() => app.quit())
  })
}

async function bootstrap(): Promise<void> {
  app.setAppUserModelId('com.bunny.mediahub')
  paths = dataPaths(app.getPath('userData'))

  library = new LibraryStore(paths.library)
  playlists = new PlaylistStore(paths.playlists)
  settings = new SettingsStore(paths.settings)
  session = new SessionStore(paths.session)
  youtube = new YouTubeStore(paths.youtube)

  await Promise.all([library.load(), playlists.load(), settings.load(), session.load(), youtube.load()])

  scanner = new ScannerService({
    workerPath: join(__dirname, 'scannerWorker.js'),
    onProgress: (progress) => {
      currentProgress = progress
      mainWindow?.webContents.send(IPC.libraryProgress, progress)
    },
    onTracks: (tracks) => {
      library.upsertTracks(tracks)
      scheduleLibraryBroadcast()
    },
    onRemoved: (trackIds) => {
      library.removeTracks(trackIds)
      playlists.prune(new Set(library.allTrackIds()))
      scheduleLibraryBroadcast()
    }
  })

  Object.assign(context, {
    library,
    playlists,
    settings,
    session,
    youtube,
    scanner,
    paths,
    scanFolder,
    broadcastLibrary: () => broadcastLibraryNow(),
    broadcastPlaylists: () => {
      mainWindow?.webContents.send(IPC.playlistsChanged, playlists.state())
    }
  })

  registerMediaProtocol(library, paths.root)
  registerIpc(context)

  // Production loads the built renderer over loopback HTTP so it has an origin
  // and Referer for the official YouTube embed; development uses Vite.
  if (!process.env.ELECTRON_RENDERER_URL) {
    rendererServer = await startRendererServer(join(__dirname, '../renderer'))
  }

  applySecurityPolicy()
  createWindow()

  if (!process.env.ELECTRON_RENDERER_URL) Menu.setApplicationMenu(null)

  if (settings.value.scanOnStartup) {
    scheduledScan = setTimeout(() => void rescanAllFolders(), 2500)
    scheduledScan.unref?.()
  }
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1040,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#0b0e0d',
    title: 'Bunny Media Hub',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false
    }
  })

  mainWindow = window

  window.once('ready-to-show', () => {
    window.show()
  })

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  window.on('maximize', () => window.webContents.send('window:maximized', true))
  window.on('unmaximize', () => window.webContents.send('window:maximized', false))

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalHttpUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    const current = window.webContents.getURL()
    if (url === current) return
    if (process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL)) return
    if (isInternalUrl(url)) return
    event.preventDefault()
    if (isExternalHttpUrl(url)) void shell.openExternal(url)
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void window.loadURL(devUrl)
  } else if (rendererServer) {
    void window.loadURL(`${rendererServer.origin}/index.html`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function applySecurityPolicy(): void {
  electronSession.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    // Sprint 1 needs no device permissions (no microphone, camera, notifications).
    callback(false)
  })

  if (process.env.ELECTRON_RENDERER_URL) return

  const policy = [
    "default-src 'self'",
    // The YouTube IFrame Player API script is loaded from youtube.com; nothing
    // else may execute.
    "script-src 'self' https://www.youtube.com https://s.ytimg.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' bunny-media: data: blob: https://i.ytimg.com https://img.youtube.com",
    "media-src 'self' bunny-media: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://www.youtube.com https://www.googleapis.com",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com"
  ].join('; ')

  const devUrl = process.env.ELECTRON_RENDERER_URL

  electronSession.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Only the app's own document gets the policy. Applying it to every response
    // would also rewrite YouTube's iframe document (the embedded player), whose
    // inline bootstrap scripts the policy is designed to block for us.
    const isAppDocument =
      details.resourceType === 'mainFrame' &&
      (details.url.startsWith('file://') ||
        (devUrl ? details.url.startsWith(devUrl) : false) ||
        (rendererServer ? details.url.startsWith(rendererServer.origin) : false))

    if (!isAppDocument) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy]
      }
    })
  })
}

async function scanFolder(folderId: string, folderPath: string) {
  try {
    const summary = await scanner.scan({
      folderId,
      folderPath,
      artworkDir: paths.artworkDir,
      known: library.knownFiles(folderId)
    })
    library.markFolderScanned(folderId)
    library.setLastScan(summary)
    await Promise.all([library.flush(), playlists.flush()])
    return { cancelled: false, folderId, summary }
  } catch (error) {
    return { cancelled: false, folderId, error: error instanceof Error ? error.message : String(error) }
  } finally {
    currentProgress = null
    mainWindow?.webContents.send(IPC.libraryProgress, null)
    broadcastLibraryNow()
  }
}

async function rescanAllFolders(): Promise<void> {
  for (const folder of library.folders) {
    if (scanner.isScanning) return
    await scanFolder(folder.id, folder.path)
  }
}

function scheduleLibraryBroadcast(): void {
  if (broadcastTimer) return
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null
    broadcastLibraryNow()
  }, 400)
  broadcastTimer.unref?.()
}

function broadcastLibraryNow(): void {
  if (!mainWindow) return
  mainWindow.webContents.send(IPC.libraryChanged, buildLibraryState(context))
}

function isExternalHttpUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}
