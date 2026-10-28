import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import type { StreamAddResult, StreamSourceView } from '@shared/ipc'
import { usePlayerActions, usePlayerState } from './player'
import { useUi } from './ui'
import { useYouTube } from './youtube'

export type StreamPlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

interface StreamsContextValue {
  sources: StreamSourceView[]
  current: StreamSourceView | null
  status: StreamPlaybackStatus
  error: string | null
  adding: boolean
  add: (rawUrl: string) => Promise<StreamAddResult | null>
  addSuggested: () => Promise<void>
  play: (source: StreamSourceView) => void
  stop: () => void
  setStatus: (status: StreamPlaybackStatus) => void
  setError: (message: string | null) => void
  remove: (id: string) => Promise<void>
  rename: (id: string, name: string) => Promise<void>
  openExternally: (source: StreamSourceView) => Promise<void>
}

const StreamsContext = createContext<StreamsContextValue | null>(null)

/**
 * One network-stream session for the whole window.
 *
 * The player element is mounted by the shell, not by the Streams view, so a
 * stream keeps playing while you browse the library — the behaviour a desktop
 * media player is expected to have. Starting a stream pauses local playback and
 * stops YouTube (whose terms require its player to stay visible), and starting
 * either of those stops the stream, so two sources never talk over each other.
 */
export function StreamsProvider({ children }: { children: ReactNode }): ReactElement {
  const [sources, setSources] = useState<StreamSourceView[]>([])
  const [current, setCurrent] = useState<StreamSourceView | null>(null)
  const [status, setStatus] = useState<StreamPlaybackStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const ui = useUi()
  const player = usePlayerActions()
  const youtube = useYouTube()
  const playerStatus = usePlayerState()?.status ?? 'idle'

  const currentRef = useRef<StreamSourceView | null>(null)
  currentRef.current = current
  const previousPlayerStatus = useRef(playerStatus)

  useEffect(() => {
    let cancelled = false
    void window.bunny.streams
      .state()
      .then((state) => {
        if (!cancelled) setSources(state.sources)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const stop = useCallback(() => {
    setCurrent(null)
    setStatus('idle')
    setError(null)
  }, [])

  const play = useCallback(
    (source: StreamSourceView) => {
      if (youtube.current) youtube.stop()
      const playback = player.controller
      if (playback && playback.getState().status === 'playing') void playback.pause()

      setCurrent(source)
      if (source.kind === 'unsupported') {
        setStatus('error')
        setError(source.unsupportedReason ?? 'This stream needs an external player.')
      } else {
        setStatus('loading')
        setError(null)
      }
      void window.bunny.streams
        .markPlayed(source.id)
        .then((state) => setSources(state.sources))
        .catch(() => undefined)
    },
    [player, youtube]
  )

  const add = useCallback(
    async (rawUrl: string): Promise<StreamAddResult | null> => {
      setAdding(true)
      try {
        const result = await window.bunny.streams.add(rawUrl)
        setSources(result.state.sources)
        if (!result.ok) {
          ui.pushToast({
            kind: 'error',
            title: 'Stream not added',
            message: result.error ?? 'That link could not be added.'
          })
        } else if (result.added === 0) {
          ui.pushToast({ title: 'Already saved', message: 'That link is already in your streams.' })
        } else {
          ui.pushToast({
            kind: 'success',
            title: result.added === 1 ? 'Stream added' : `${result.added} streams added`,
            message:
              result.error ??
              (result.added === 1
                ? 'Select it below to play.'
                : 'Imported from the playlist. Pick any channel to start.')
          })
        }
        return result
      } catch (cause) {
        ui.pushToast({
          kind: 'error',
          title: 'Stream not added',
          message: cause instanceof Error ? cause.message : String(cause)
        })
        return null
      } finally {
        setAdding(false)
      }
    },
    [ui]
  )

  const addSuggested = useCallback(async () => {
    try {
      const state = await window.bunny.streams.addSuggested()
      setSources(state.sources)
      ui.pushToast({
        kind: 'success',
        title: 'Suggested streams added',
        message: 'Public radio, NASA TV, and public-domain film and audiobooks.'
      })
    } catch (cause) {
      ui.pushToast({ kind: 'error', title: 'Could not add suggestions', message: String(cause) })
    }
  }, [ui])

  const remove = useCallback(
    async (id: string) => {
      try {
        const state = await window.bunny.streams.remove(id)
        setSources(state.sources)
        if (currentRef.current?.id === id) {
          setCurrent(null)
          setStatus('idle')
          setError(null)
        }
      } catch (cause) {
        ui.pushToast({ kind: 'error', title: 'Could not remove stream', message: String(cause) })
      }
    },
    [ui]
  )

  const rename = useCallback(
    async (id: string, name: string) => {
      try {
        const state = await window.bunny.streams.rename(id, name)
        setSources(state.sources)
        setCurrent((value) => (value && value.id === id ? { ...value, name } : value))
      } catch (cause) {
        ui.pushToast({ kind: 'error', title: 'Could not rename stream', message: String(cause) })
      }
    },
    [ui]
  )

  const openExternally = useCallback(
    async (source: StreamSourceView) => {
      try {
        const result = await window.bunny.streams.openExternal(source.url)
        if (!result.ok) {
          ui.pushToast({ kind: 'error', title: 'Could not open stream', message: result.error ?? 'Unknown error.' })
          return
        }
        ui.pushToast({
          title: result.player === 'vlc' ? 'Opened in VLC' : 'Opened in your default player',
          message: result.player === 'vlc' ? 'VLC handles containers Chromium cannot decode.' : source.name
        })
      } catch (cause) {
        ui.pushToast({ kind: 'error', title: 'Could not open stream', message: String(cause) })
      }
    },
    [ui]
  )

  // YouTube's player must stay the visible, foreground experience; two players
  // running at once also just sounds wrong.
  useEffect(() => {
    if (youtube.current && currentRef.current) stop()
  }, [youtube.current, stop])

  // Only a transition *into* playing counts: pausing local audio as the stream
  // starts is a transition into 'paused' and must not kill the stream.
  useEffect(() => {
    const was = previousPlayerStatus.current
    previousPlayerStatus.current = playerStatus
    if (was !== 'playing' && playerStatus === 'playing' && currentRef.current) stop()
  }, [playerStatus, stop])

  const value = useMemo<StreamsContextValue>(
    () => ({
      sources,
      current,
      status,
      error,
      adding,
      add,
      addSuggested,
      play,
      stop,
      setStatus,
      setError,
      remove,
      rename,
      openExternally
    }),
    [sources, current, status, error, adding, add, addSuggested, play, stop, remove, rename, openExternally]
  )

  return <StreamsContext.Provider value={value}>{children}</StreamsContext.Provider>
}

export function useStreams(): StreamsContextValue {
  const context = useContext(StreamsContext)
  if (!context) throw new Error('useStreams must be used inside StreamsProvider')
  return context
}
