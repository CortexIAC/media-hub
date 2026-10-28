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
import type { YouTubeVideo } from '@core/youtube'
import {
  afterYouTubeEnded,
  clearYouTubeQueue,
  EMPTY_YOUTUBE_QUEUE,
  enqueueYouTubeNext,
  enqueueYouTubeVideo,
  playYouTubeList,
  playYouTubeNext,
  playYouTubeNow,
  playYouTubePrevious,
  removeQueuedVideo,
  stopYouTubePlayback,
  type YouTubeQueueState
} from '@core/youtubeQueue'
import type { YouTubeLibraryView } from '@shared/ipc'
import type { YouTubePlaybackState } from '../playback/youtubePlayer'

interface YouTubeContextValue {
  current: YouTubeVideo | null
  queue: YouTubeVideo[]
  played: YouTubeVideo[]
  library: YouTubeLibraryView
  favoriteIds: Set<string>
  playerState: YouTubePlaybackState
  play: (video: YouTubeVideo) => void
  playList: (videos: YouTubeVideo[], index?: number) => void
  playNextUp: (video: YouTubeVideo) => void
  enqueue: (video: YouTubeVideo) => void
  removeFromQueue: (id: string) => void
  clearQueue: () => void
  next: () => void
  previous: () => void
  stop: () => void
  setPlayerState: (state: YouTubePlaybackState) => void
  handleEnded: () => void
  toggleFavorite: (video: YouTubeVideo) => void
}

const YouTubeContext = createContext<YouTubeContextValue | null>(null)

/**
 * One YouTube session shared by the whole window.
 *
 * The player itself lives in `YouTubeStage` and is mounted once by the shell, so
 * moving between views never destroys the iframe. Search, the Video screen and
 * the docked player all read and write this state instead of keeping copies.
 */
export function YouTubeProvider({ children }: { children: ReactNode }): ReactElement {
  const [queueState, setQueueState] = useState<YouTubeQueueState>(EMPTY_YOUTUBE_QUEUE)
  const [library, setLibrary] = useState<YouTubeLibraryView>({ favorites: [], history: [] })
  const [playerState, setPlayerState] = useState<YouTubePlaybackState>('unstarted')

  useEffect(() => {
    let cancelled = false
    void window.bunny.youtube
      .state()
      .then((state) => {
        if (!cancelled) setLibrary(state)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const remember = useCallback((video: YouTubeVideo) => {
    void window.bunny.youtube.addHistory(video).then(setLibrary).catch(() => undefined)
  }, [])

  const play = useCallback(
    (video: YouTubeVideo) => {
      setQueueState((current) => playYouTubeNow(current, video))
      remember(video)
    },
    [remember]
  )

  const playList = useCallback(
    (videos: YouTubeVideo[], index = 0) => {
      setQueueState((current) => playYouTubeList(current, videos, index))
      const chosen = videos[index]
      if (chosen) remember(chosen)
    },
    [remember]
  )

  const next = useCallback(() => {
    setQueueState((current) => {
      const upcoming = current.queue[0]
      const nextState = playYouTubeNext(current)
      if (upcoming && nextState.current?.id === upcoming.id) remember(upcoming)
      return nextState
    })
  }, [remember])

  const previous = useCallback(() => {
    setQueueState((current) => playYouTubePrevious(current))
  }, [])

  const playNextUp = useCallback((video: YouTubeVideo) => {
    setQueueState((current) => enqueueYouTubeNext(current, video))
  }, [])

  const enqueue = useCallback((video: YouTubeVideo) => {
    setQueueState((current) => enqueueYouTubeVideo(current, video))
  }, [])

  const removeFromQueue = useCallback((id: string) => {
    setQueueState((current) => removeQueuedVideo(current, id))
  }, [])

  const clearQueue = useCallback(() => {
    setQueueState((current) => clearYouTubeQueue(current))
  }, [])

  const stop = useCallback(() => {
    setQueueState((current) => stopYouTubePlayback(current))
    setPlayerState('unstarted')
  }, [])

  const handleEnded = useCallback(() => {
    setQueueState((current) => {
      const upcoming = current.queue[0]
      const nextState = afterYouTubeEnded(current)
      if (upcoming && nextState.current?.id === upcoming.id) remember(upcoming)
      return nextState
    })
  }, [remember])

  const toggleFavorite = useCallback((video: YouTubeVideo) => {
    void window.bunny.youtube.toggleFavorite(video).then(setLibrary).catch(() => undefined)
  }, [])

  const favoriteIds = useMemo(() => new Set(library.favorites.map((video) => video.id)), [library.favorites])

  const value = useMemo<YouTubeContextValue>(
    () => ({
      current: queueState.current,
      queue: queueState.queue,
      played: queueState.played,
      library,
      favoriteIds,
      playerState,
      play,
      playList,
      playNextUp,
      enqueue,
      removeFromQueue,
      clearQueue,
      next,
      previous,
      stop,
      setPlayerState,
      handleEnded,
      toggleFavorite
    }),
    [
      queueState,
      library,
      favoriteIds,
      playerState,
      play,
      playList,
      playNextUp,
      enqueue,
      removeFromQueue,
      clearQueue,
      next,
      previous,
      stop,
      handleEnded,
      toggleFavorite
    ]
  )

  return <YouTubeContext.Provider value={value}>{children}</YouTubeContext.Provider>
}

export function useYouTube(): YouTubeContextValue {
  const context = useContext(YouTubeContext)
  if (!context) throw new Error('useYouTube must be used inside YouTubeProvider')
  return context
}

export interface YouTubeSearchState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  videos: YouTubeVideo[]
  error: string | null
  needsKey: boolean
}

const IDLE_SEARCH: YouTubeSearchState = { status: 'idle', videos: [], error: null, needsKey: false }

/**
 * Debounced YouTube search for the global search field.
 *
 * The request runs in the main process, so a slow or refused request cannot
 * block typing. Results from a stale query are dropped instead of flickering in.
 */
export function useYouTubeSearch(query: string, delayMs = 450): YouTubeSearchState {
  const [state, setState] = useState<YouTubeSearchState>(IDLE_SEARCH)
  const requestId = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      requestId.current += 1
      setState(IDLE_SEARCH)
      return
    }

    const id = requestId.current + 1
    requestId.current = id
    setState((previous) => ({ status: 'loading', videos: previous.videos, error: null, needsKey: false }))

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await window.bunny.youtube.search(trimmed)
          if (requestId.current !== id) return
          setState({
            status: result.error ? 'error' : 'ready',
            videos: result.videos,
            error: result.error ?? null,
            needsKey: result.needsKey
          })
        } catch (error) {
          if (requestId.current !== id) return
          setState({
            status: 'error',
            videos: [],
            error: error instanceof Error ? error.message : String(error),
            needsKey: false
          })
        }
      })()
    }, delayMs)

    return () => window.clearTimeout(timer)
  }, [query, delayMs])

  return state
}
