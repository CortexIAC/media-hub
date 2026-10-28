import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import { DEFAULT_SETTINGS, type AppSettings, type LibraryFolder, type LibrarySnapshot, type PlaybackSession, type Playlist, type ScanProgress, type Track } from '@core/models'
import { groupAlbums, groupArtists, type AlbumGroup, type ArtistGroup } from '@core/search'
import type { PlaylistState, VerifyResult } from '@shared/ipc'
import { applyAccent } from '../theme/theme'
import { useUi } from './ui'

interface DataContextValue {
  ready: boolean
  fatalError: string | null
  tracks: Track[]
  tracksById: Map<string, Track>
  albums: AlbumGroup[]
  artists: ArtistGroup[]
  folders: LibraryFolder[]
  scanning: ScanProgress | null
  lastScan: LibrarySnapshot['lastScan']
  playlists: Playlist[]
  favorites: Set<string>
  settings: AppSettings
  initialSession: PlaybackSession | null
  importFolder: () => Promise<void>
  rescanFolder: (folderId: string) => Promise<void>
  removeFolder: (folderId: string) => Promise<void>
  cancelScan: () => Promise<void>
  verifyLibrary: () => Promise<VerifyResult | null>
  createPlaylist: (name: string, trackIds?: string[]) => Promise<Playlist | null>
  addToPlaylist: (playlistId: string, trackIds: string[]) => Promise<void>
  removeFromPlaylist: (playlistId: string, trackId: string) => Promise<void>
  reorderPlaylist: (playlistId: string, from: number, to: number) => Promise<void>
  renamePlaylist: (playlistId: string, name: string) => Promise<void>
  deletePlaylist: (playlistId: string) => Promise<void>
  toggleFavorite: (trackId: string) => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
}

const DataContext = createContext<DataContextValue | null>(null)

const EMPTY_TRACKS: Track[] = []

export function DataProvider({ children }: { children: ReactNode }): ReactElement {
  const ui = useUi()
  const [ready, setReady] = useState(false)
  const [fatalError, setFatalError] = useState<string | null>(null)
  const [library, setLibrary] = useState<{ snapshot: LibrarySnapshot; scanning: ScanProgress | null }>({
    snapshot: { folders: [], tracks: [], lastScan: null },
    scanning: null
  })
  const [playlistState, setPlaylistState] = useState<PlaylistState>({ playlists: [], favorites: [] })
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [initialSession, setInitialSession] = useState<PlaybackSession | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [libraryState, playlists, loadedSettings, session] = await Promise.all([
          window.bunny.library.get(),
          window.bunny.playlists.get(),
          window.bunny.settings.get(),
          window.bunny.session.get()
        ])
        if (cancelled) return
        setLibrary({ snapshot: { folders: libraryState.folders, tracks: libraryState.tracks, lastScan: libraryState.lastScan }, scanning: libraryState.scanning })
        setPlaylistState(playlists)
        setSettings(loadedSettings)
        setInitialSession(session)
        setReady(true)
      } catch (error) {
        if (!cancelled) setFatalError(messageOf(error))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    const offLibrary = window.bunny.library.onChanged((state) => {
      setLibrary({
        snapshot: { folders: state.folders, tracks: state.tracks, lastScan: state.lastScan },
        scanning: state.scanning
      })
    })
    const offProgress = window.bunny.library.onProgress((progress) => {
      setLibrary((current) => ({ ...current, scanning: progress }))
    })
    const offPlaylists = window.bunny.playlists.onChanged(setPlaylistState)
    return () => {
      offLibrary()
      offProgress()
      offPlaylists()
    }
  }, [ready])

  useEffect(() => {
    applyAccent(settings.accent)
  }, [settings.accent])

  const importFolder = useCallback(async () => {
    const result = await safeCall(() => window.bunny.library.importFolder(), ui, 'Could not import that folder')
    if (!result || result.cancelled) return
    if (result.error) {
      ui.pushToast({ kind: 'error', title: 'Import failed', message: result.error })
      return
    }
    const summary = result.summary
    if (!summary) return
    if (summary.cancelled) {
      ui.pushToast({ title: 'Import cancelled', message: 'Tracks found before cancelling were kept.' })
      return
    }
    const parts = [`${summary.tracksAdded} new`, `${summary.tracksUnchanged} unchanged`]
    if (summary.tracksUpdated > 0) parts.push(`${summary.tracksUpdated} updated`)
    if (summary.failures.length > 0) parts.push(`${summary.failures.length} unreadable`)
    ui.pushToast({
      kind: 'success',
      title: summary.tracksAdded > 0 ? 'Library updated' : 'Library scanned',
      message: parts.join(' · ')
    })
  }, [ui])

  const rescanFolder = useCallback(
    async (folderId: string) => {
      const result = await safeCall(() => window.bunny.library.rescan(folderId), ui, 'Could not rescan that folder')
      if (!result) return
      if (result.error) {
        ui.pushToast({ kind: 'error', title: 'Scan failed', message: result.error })
        return
      }
      if (result.summary) {
        const summary = result.summary
        ui.pushToast({
          kind: 'success',
          title: summary.cancelled ? 'Scan cancelled' : 'Scan finished',
          message: `${summary.tracksAdded} new · ${summary.tracksUpdated} updated · ${summary.tracksRemoved} removed`
        })
      }
    },
    [ui]
  )

  const removeFolder = useCallback(
    async (folderId: string) => {
      const result = await safeCall(() => window.bunny.library.removeFolder(folderId), ui, 'Could not remove that folder')
      if (result) {
        ui.pushToast({ title: 'Folder removed', message: `${result.removedTracks} tracks removed from the library.` })
      }
    },
    [ui]
  )

  const cancelScan = useCallback(async () => {
    await safeCall(() => window.bunny.library.cancelScan(), ui, 'Could not cancel the scan')
  }, [ui])

  const verifyLibrary = useCallback(async (): Promise<VerifyResult | null> => {
    const result = await safeCall(() => window.bunny.library.verify(), ui, 'Could not verify the library')
    if (!result) return null
    ui.pushToast({
      kind: result.missing > 0 ? 'error' : 'success',
      title: result.missing > 0 ? 'Missing files found' : 'Library verified',
      message:
        result.missing > 0
          ? `${result.missing} of ${result.checked} files are missing or unreadable.`
          : `All ${result.checked} files are present.`
    })
    return result
  }, [ui])

  const createPlaylist = useCallback(
    async (name: string, trackIds: string[] = []) => {
      const playlist = await safeCall(() => window.bunny.playlists.create(name, trackIds), ui, 'Could not create the playlist')
      if (playlist) ui.pushToast({ kind: 'success', title: 'Playlist created', message: playlist.name })
      return playlist
    },
    [ui]
  )

  const addToPlaylist = useCallback(
    async (playlistId: string, trackIds: string[]) => {
      const playlist = await safeCall(() => window.bunny.playlists.addTracks(playlistId, trackIds), ui, 'Could not add to the playlist')
      if (playlist) {
        ui.pushToast({
          title: 'Added to playlist',
          message: `${trackIds.length} ${trackIds.length === 1 ? 'track' : 'tracks'} → ${playlist.name}`
        })
      }
    },
    [ui]
  )

  const removeFromPlaylist = useCallback(
    async (playlistId: string, trackId: string) => {
      await safeCall(() => window.bunny.playlists.removeTrack(playlistId, trackId), ui, 'Could not remove the track')
    },
    [ui]
  )

  const reorderPlaylist = useCallback(
    async (playlistId: string, from: number, to: number) => {
      await safeCall(() => window.bunny.playlists.reorder(playlistId, from, to), ui, 'Could not reorder the playlist')
    },
    [ui]
  )

  const renamePlaylist = useCallback(
    async (playlistId: string, name: string) => {
      const playlist = await safeCall(() => window.bunny.playlists.rename(playlistId, name), ui, 'Could not rename the playlist')
      if (playlist) ui.pushToast({ title: 'Playlist renamed', message: playlist.name })
    },
    [ui]
  )

  const deletePlaylist = useCallback(
    async (playlistId: string) => {
      const done = await safeCall(() => window.bunny.playlists.remove(playlistId).then(() => true), ui, 'Could not delete the playlist')
      if (done) ui.pushToast({ title: 'Playlist deleted', message: 'The tracks themselves were not touched.' })
    },
    [ui]
  )

  const toggleFavorite = useCallback(
    async (trackId: string) => {
      const favorite = await safeCall(() => window.bunny.playlists.toggleFavorite(trackId), ui, 'Could not update favorites')
      if (favorite === undefined) return
      setPlaylistState((current) => {
        const next = new Set(current.favorites)
        if (favorite) next.add(trackId)
        else next.delete(trackId)
        return { ...current, favorites: [...next] }
      })
    },
    [ui]
  )

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      setSettings((current) => ({ ...current, ...patch }))
      const next = await safeCall(() => window.bunny.settings.update(patch), ui, 'Could not save settings')
      if (next) setSettings(next)
    },
    [ui]
  )

  const tracks = library.snapshot.tracks
  const tracksById = useMemo(() => new Map(tracks.map((track) => [track.id, track])), [tracks])
  const albums = useMemo(() => groupAlbums(tracks), [tracks])
  const artists = useMemo(() => groupArtists(tracks), [tracks])
  const favorites = useMemo(() => new Set(playlistState.favorites), [playlistState.favorites])

  const value = useMemo<DataContextValue>(
    () => ({
      ready,
      fatalError,
      tracks: tracks ?? EMPTY_TRACKS,
      tracksById,
      albums,
      artists,
      folders: library.snapshot.folders,
      scanning: library.scanning,
      lastScan: library.snapshot.lastScan,
      playlists: playlistState.playlists,
      favorites,
      settings,
      initialSession,
      importFolder,
      rescanFolder,
      removeFolder,
      cancelScan,
      verifyLibrary,
      createPlaylist,
      addToPlaylist,
      removeFromPlaylist,
      reorderPlaylist,
      renamePlaylist,
      deletePlaylist,
      toggleFavorite,
      updateSettings
    }),
    [
      ready,
      fatalError,
      tracks,
      tracksById,
      albums,
      artists,
      library,
      playlistState.playlists,
      favorites,
      settings,
      initialSession,
      importFolder,
      rescanFolder,
      removeFolder,
      cancelScan,
      verifyLibrary,
      createPlaylist,
      addToPlaylist,
      removeFromPlaylist,
      reorderPlaylist,
      renamePlaylist,
      deletePlaylist,
      toggleFavorite,
      updateSettings
    ]
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const context = useContext(DataContext)
  if (!context) throw new Error('useData must be used inside DataProvider')
  return context
}

async function safeCall<T>(call: () => Promise<T>, ui: ReturnType<typeof useUi>, fallbackTitle: string): Promise<T | null> {
  try {
    return await call()
  } catch (error) {
    ui.pushToast({ kind: 'error', title: fallbackTitle, message: messageOf(error) })
    return null
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    // Electron wraps IPC failures in "Error invoking remote method ...".
    return error.message.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '')
  }
  return String(error)
}
