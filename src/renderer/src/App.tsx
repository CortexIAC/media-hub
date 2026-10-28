import { useEffect, type ReactElement } from 'react'
import { ModalHost } from './components/ModalHost'
import { PlaybackBar } from './components/PlaybackBar'
import { QueuePanel } from './components/QueuePanel'
import { Sidebar } from './components/Sidebar'
import { StreamStage } from './components/StreamStage'
import { TitleBar } from './components/TitleBar'
import { Toasts } from './components/Toasts'
import { YouTubeStage } from './components/YouTubeStage'
import { ArchiveProvider } from './state/archive'
import { DataProvider, useData } from './state/data'
import { PlayerProvider, usePlayerActions } from './state/player'
import { StreamsProvider, useStreams } from './state/streams'
import { UiProvider, useUi } from './state/ui'
import { YouTubeProvider, useYouTube } from './state/youtube'
import { AlbumView } from './views/AlbumView'
import { ArchiveView } from './views/ArchiveView'
import { ArtistView } from './views/ArtistView'
import { DevicesView } from './views/DevicesView'
import { FavoritesView } from './views/FavoritesView'
import { LibraryView } from './views/LibraryView'
import { MusicView } from './views/MusicView'
import { NowPlayingView } from './views/NowPlayingView'
import { PlaylistView } from './views/PlaylistView'
import { SearchView } from './views/SearchView'
import { SettingsView } from './views/SettingsView'
import { StreamsView } from './views/StreamsView'
import { VideoView } from './views/VideoView'
import { VirtualLibraryView } from './views/VirtualLibraryView'
import { MusicIcon } from './components/Icons'

export default function App(): ReactElement {
  return (
    <UiProvider>
      <DataProvider>
        <PlayerProvider>
          <YouTubeProvider>
            <StreamsProvider>
              <ArchiveProvider>
                <Shell />
              </ArchiveProvider>
            </StreamsProvider>
          </YouTubeProvider>
        </PlayerProvider>
      </DataProvider>
    </UiProvider>
  )
}

function Shell(): ReactElement {
  const data = useData()
  const ui = useUi()
  const youtube = useYouTube()
  const streams = useStreams()
  // The players are single elements that change size and position, never
  // identity: on their own screen they are the stage, elsewhere they dock to the
  // corner. The content column stacks when either one is staged.
  const staged =
    (ui.route.name === 'video' && youtube.current !== null) ||
    ((ui.route.name === 'streams' || ui.route.name === 'archive') && streams.current !== null)

  useKeyboardShortcuts()

  if (data.fatalError) {
    return (
      <div className="boot-screen">
        <div className="brand-mark" style={{ width: 34, height: 34 }}>
          <MusicIcon size={18} />
        </div>
        <h1>Bunny Media Hub could not start</h1>
        <p>{data.fatalError}</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload the app
        </button>
      </div>
    )
  }

  if (!data.ready) {
    return (
      <div className="boot-screen">
        <div className="brand-mark" style={{ width: 34, height: 34 }}>
          <MusicIcon size={18} />
        </div>
        <h1>Bunny Media Hub</h1>
        <p>Loading your library…</p>
        <span className="spinner" />
      </div>
    )
  }

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <div className={`content ${staged ? 'has-stage' : ''}`}>
          <YouTubeStage />
          <StreamStage />
          <ViewRouter />
        </div>
        {ui.queueOpen ? <QueuePanel /> : null}
      </div>
      <PlaybackBar />
      <Toasts />
      <ModalHost />
    </div>
  )
}

function ViewRouter(): ReactElement {
  const ui = useUi()
  const route = ui.route

  switch (route.name) {
    case 'music':
      return <MusicView />
    case 'video':
      return <VideoView />
    case 'streams':
      return <StreamsView />
    case 'archive':
      return <ArchiveView />
    case 'virtual-library':
      return <VirtualLibraryView />
    case 'library':
      return <LibraryView />
    case 'devices':
      return <DevicesView />
    case 'settings':
      return <SettingsView />
    case 'favorites':
      return <FavoritesView />
    case 'search':
      return <SearchView />
    case 'now-playing':
      return <NowPlayingView />
    case 'album':
      return <AlbumView albumKey={route.key} />
    case 'artist':
      return <ArtistView name={route.artist} />
    case 'playlist':
      return <PlaylistView id={route.id} />
  }
}

function useKeyboardShortcuts(): void {
  const player = usePlayerActions()
  const ui = useUi()
  const data = useData()
  const importFolder = data.importFolder

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const typing =
        Boolean(target) && (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable === true)
      const mod = event.ctrlKey || event.metaKey

      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        document.getElementById('global-search')?.focus()
        return
      }
      if (mod && event.key.toLowerCase() === 'i') {
        event.preventDefault()
        void importFolder()
        return
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === 'q') {
        event.preventDefault()
        ui.toggleQueue()
        return
      }
      if (typing) return

      const controller = player.controller
      const current = controller?.getState()

      if (event.key === 'Escape') {
        if (!ui.modal && ui.queueOpen) ui.setQueueOpen(false)
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        player.toggle()
        return
      }

      if (event.key === 'ArrowRight' && mod) {
        event.preventDefault()
        player.next()
        return
      }
      if (event.key === 'ArrowLeft' && mod) {
        event.preventDefault()
        player.previous()
        return
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault()
        if (!current) return
        const delta = event.key === 'ArrowRight' ? 5000 : -5000
        player.seek(Math.max(0, current.positionMs + delta))
        return
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault()
        const value = (current?.volume ?? 0.8) + (event.key === 'ArrowUp' ? 0.05 : -0.05)
        player.setVolume(Math.min(1, Math.max(0, value)))
        return
      }

      if (mod) return

      switch (event.key.toLowerCase()) {
        case 'm':
          player.toggleMute()
          break
        case 's':
          player.setShuffle(!(current?.queue.shuffle ?? false))
          break
        case 'r':
          player.cycleRepeat()
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [player, ui, importFolder])
}
