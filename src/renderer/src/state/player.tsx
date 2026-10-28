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
import type { EqualizerSettings, RepeatMode } from '@core/models'
import { PlayerController, type PlayerState } from '@core/player'
import { HtmlAudioBackend } from '../playback/audioEngine'
import { useData } from './data'
import { useUi } from './ui'

export interface PlayerActions {
  controller: PlayerController | null
  playTracks: (ids: string[], startTrackId?: string) => void
  shuffleAndPlay: (ids: string[]) => void
  playNext: (ids: string[]) => void
  addToQueue: (ids: string[]) => void
  clearQueue: () => void
  toggle: () => void
  next: () => void
  previous: () => void
  seek: (positionMs: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  setShuffle: (enabled: boolean) => void
  setRepeat: (mode: RepeatMode) => void
  cycleRepeat: () => void
  setEqualizer: (equalizer: EqualizerSettings) => void
  jumpToQueueIndex: (index: number) => void
  removeFromQueue: (index: number) => void
}

const PlayerActionsContext = createContext<PlayerActions | null>(null)
const PlayerStateContext = createContext<PlayerState | null>(null)

export function PlayerProvider({ children }: { children: ReactNode }): ReactElement {
  const data = useData()
  const ui = useUi()
  const toastRef = useRef(ui.pushToast)
  toastRef.current = ui.pushToast
  const updateSettingsRef = useRef(data.updateSettings)
  updateSettingsRef.current = data.updateSettings

  const [controller, setController] = useState<PlayerController | null>(null)
  const [state, setState] = useState<PlayerState | null>(null)
  const volumeTimer = useRef<number | null>(null)
  const backendRef = useRef<HtmlAudioBackend | null>(null)

  useEffect(() => {
    if (!data.ready) return
    let disposed = false
    const backend = new HtmlAudioBackend()
    backendRef.current = backend
    backend.applyEqualizer(data.settings.equalizer)
    const player = new PlayerController({
      backend,
      resolveSource: async (trackId) => {
        const source = await window.bunny.media.resolveTrack(trackId)
        return source ? { trackId, url: source.url, durationHintMs: source.durationHintMs } : null
      },
      initialVolume: data.settings.volume,
      initialMuted: data.settings.muted,
      onState: (next) => {
        if (!disposed) setState(next)
      },
      onError: (error) => {
        toastRef.current({
          kind: 'error',
          title: 'Playback problem',
          message: error.message,
          action: { label: 'Skip track', run: () => void player.next() }
        })
      }
    })
    setController(player)
    setState(player.getState())

    if (data.initialSession) {
      void player.restore(data.initialSession, data.settings.shuffle, data.settings.repeat)
    }

    return () => {
      disposed = true
      void player.dispose()
      backendRef.current = null
      setController(null)
      setState(null)
    }
    // Intentionally runs once when the data layer becomes ready: settings at
    // that point are already loaded from disk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.ready])

  // Persist a resumable session while the app is running.
  useEffect(() => {
    if (!controller) return
    const save = (): void => {
      const current = controller.getState()
      if (!current.trackId) return
      void window.bunny.session.save({
        trackId: current.trackId,
        queueIds: current.queue.ids,
        queueIndex: current.queue.index,
        positionMs: current.positionMs,
        updatedAt: Date.now()
      })
    }
    save()
    const interval = window.setInterval(save, 5000)
    const onHide = (): void => save()
    window.addEventListener('beforeunload', onHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('beforeunload', onHide)
      document.removeEventListener('visibilitychange', onHide)
      save()
    }
  }, [controller])

  const playTracks = useCallback<PlayerActions['playTracks']>(
    (ids, startTrackId) => {
      if (!controller || ids.length === 0) return
      if (startTrackId) void controller.playTrack(startTrackId, ids)
      else void controller.setQueue(ids, 0, true)
    },
    [controller]
  )

  const shuffleAndPlay = useCallback<PlayerActions['shuffleAndPlay']>(
    (ids) => {
      if (!controller || ids.length === 0) return
      void controller.playShuffled(ids)
    },
    [controller]
  )

  const playNext = useCallback<PlayerActions['playNext']>(
    (ids) => {
      if (!controller || ids.length === 0) return
      void controller.playNext(ids)
      ui.pushToast({ title: 'Playing next', message: `${ids.length} ${ids.length === 1 ? 'track' : 'tracks'} queued after this one.` })
    },
    [controller, ui]
  )

  const addToQueue = useCallback<PlayerActions['addToQueue']>(
    (ids) => {
      if (!controller || ids.length === 0) return
      void controller.addToQueue(ids)
      ui.pushToast({ title: 'Added to queue', message: `${ids.length} ${ids.length === 1 ? 'track' : 'tracks'}.` })
    },
    [controller, ui]
  )

  const setVolume = useCallback<PlayerActions['setVolume']>(
    (volume) => {
      if (!controller) return
      void controller.setVolume(volume)
      if (volumeTimer.current) window.clearTimeout(volumeTimer.current)
      volumeTimer.current = window.setTimeout(() => {
        void updateSettingsRef.current({ volume })
      }, 500)
    },
    [controller]
  )

  const toggleMute = useCallback<PlayerActions['toggleMute']>(() => {
    if (!controller) return
    void controller.toggleMute().then(() => {
      void updateSettingsRef.current({ muted: controller.getState().muted })
    })
  }, [controller])

  const setShuffle = useCallback<PlayerActions['setShuffle']>(
    (enabled) => {
      if (!controller) return
      controller.setShuffle(enabled)
      void updateSettingsRef.current({ shuffle: enabled })
    },
    [controller]
  )

  const setRepeat = useCallback<PlayerActions['setRepeat']>(
    (mode) => {
      if (!controller) return
      controller.setRepeat(mode)
      void updateSettingsRef.current({ repeat: mode })
    },
    [controller]
  )

  const setEqualizer = useCallback<PlayerActions['setEqualizer']>((equalizer) => {
    backendRef.current?.applyEqualizer(equalizer)
    void updateSettingsRef.current({ equalizer })
  }, [])

  const cycleRepeat = useCallback<PlayerActions['cycleRepeat']>(() => {
    if (!controller) return
    const order: RepeatMode[] = ['off', 'all', 'one']
    const current = controller.getState().queue.repeat
    const mode = order[(order.indexOf(current) + 1) % order.length] as RepeatMode
    controller.setRepeat(mode)
    void updateSettingsRef.current({ repeat: mode })
  }, [controller])

  const actions = useMemo<PlayerActions>(
    () => ({
      controller,
      playTracks,
      shuffleAndPlay,
      playNext,
      addToQueue,
      clearQueue: () => void controller?.clearQueue(),
      toggle: () => void controller?.toggle(),
      next: () => void controller?.next(),
      previous: () => void controller?.previous(),
      seek: (positionMs) => void controller?.seek(positionMs),
      setVolume,
      toggleMute,
      setShuffle,
      setRepeat,
      cycleRepeat,
      setEqualizer,
      jumpToQueueIndex: (index) => void controller?.jumpToIndex(index),
      removeFromQueue: (index) => void controller?.removeFromQueue(index)
    }),
    [controller, playTracks, shuffleAndPlay, playNext, addToQueue, setVolume, toggleMute, setShuffle, setRepeat, cycleRepeat, setEqualizer]
  )

  return (
    <PlayerActionsContext.Provider value={actions}>
      <PlayerStateContext.Provider value={state}>{children}</PlayerStateContext.Provider>
    </PlayerActionsContext.Provider>
  )
}

export function usePlayerActions(): PlayerActions {
  const context = useContext(PlayerActionsContext)
  if (!context) throw new Error('usePlayerActions must be used inside PlayerProvider')
  return context
}

export function usePlayerState(): PlayerState | null {
  return useContext(PlayerStateContext)
}

/**
 * Subscribe to a slice of playback state. Rows that only care about the current
 * track id do not re-render on every position tick.
 */
export function usePlayerValue<T>(selector: (state: PlayerState) => T, isEqual: (a: T, b: T) => boolean = Object.is): T | null {
  const { controller } = usePlayerActions()
  const selectorRef = useRef(selector)
  selectorRef.current = selector
  const equalRef = useRef(isEqual)
  equalRef.current = isEqual
  const [value, setValue] = useState<T | null>(() => (controller ? selector(controller.getState()) : null))

  useEffect(() => {
    if (!controller) {
      setValue(null)
      return
    }
    setValue(() => selectorRef.current(controller.getState()))
    return controller.subscribe((next) => {
      setValue((previous) => {
        const candidate = selectorRef.current(next)
        if (previous !== null && equalRef.current(previous, candidate)) return previous
        return candidate
      })
    })
  }, [controller])

  return value
}
