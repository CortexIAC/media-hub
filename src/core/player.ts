import type { PlaybackSession, PlaybackStatus, RepeatMode } from './models'
import type { PlaybackBackend, PlaybackBackendEvent, PlaybackSource } from './playback'
import {
  advance,
  append,
  clear,
  createQueue,
  currentTrackId,
  isEmpty,
  insertNext,
  jumpTo,
  removeAt,
  retreat,
  setRepeat,
  setShuffle,
  type QueueState
} from './queue'

export interface PlayerError {
  message: string
  trackId: string | null
}

export interface PlayerState {
  queue: QueueState
  status: PlaybackStatus
  trackId: string | null
  positionMs: number
  durationMs: number
  volume: number
  muted: boolean
  error: PlayerError | null
}

export interface PlayerControllerOptions {
  backend: PlaybackBackend
  /** Resolve a playable URL for a track id, or null when the file is gone. */
  resolveSource: (trackId: string) => Promise<PlaybackSource | null>
  onState?: (state: PlayerState) => void
  onError?: (error: PlayerError) => void
  onTrackStarted?: (trackId: string) => void
  onQueueChanged?: (queue: QueueState) => void
  initialVolume?: number
  initialMuted?: boolean
}

const RESTART_THRESHOLD_MS = 3000

/**
 * Transport state machine shared by the UI and by tests.
 *
 * Every load is generation-tagged so a fast sequence of clicks cannot let a
 * slower earlier load overwrite a newer one. Backend failures are surfaced,
 * never swallowed, and leave the queue intact so the user can skip forward.
 */
export class PlayerController {
  private readonly backend: PlaybackBackend
  private readonly resolveSource: (trackId: string) => Promise<PlaybackSource | null>
  private readonly listeners = new Set<(state: PlayerState) => void>()
  private readonly options: PlayerControllerOptions
  private state: PlayerState
  private pendingQueueSync = false
  private generation = 0
  private disposed = false
  private readonly unsubscribeBackend: () => void

  constructor(options: PlayerControllerOptions) {
    this.options = options
    this.backend = options.backend
    this.resolveSource = options.resolveSource
    this.state = {
      queue: createQueue(),
      status: 'idle',
      trackId: null,
      positionMs: 0,
      durationMs: 0,
      volume: clamp01(options.initialVolume ?? 0.8),
      muted: options.initialMuted ?? false,
      error: null
    }
    this.unsubscribeBackend = this.backend.onEvent((event) => this.handleBackendEvent(event))
    void this.backend.setVolume(this.state.volume)
    void this.backend.setMuted(this.state.muted)
  }

  getState(): PlayerState {
    return this.state
  }

  subscribe(listener: (state: PlayerState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Restore a saved session: queue, cursor, position and transport flags. */
  async restore(session: PlaybackSession | null, shuffle = false, repeat: RepeatMode = 'off'): Promise<void> {
    if (!session || session.queueIds.length === 0) return
    let queue = createQueue(session.queueIds, session.queueIndex, repeat)
    if (shuffle) queue = setShuffle(queue, true)
    this.commit({ queue, status: 'loading', trackId: currentTrackId(queue), error: null })
    const trackId = currentTrackId(queue)
    if (!trackId) return
    await this.loadAndMaybePlay(trackId, session.positionMs, false)
  }

  async setQueue(ids: string[], startIndex = 0, autoplay = true): Promise<void> {
    const queue = this.buildQueue(ids, startIndex)
    this.commit({ queue, error: null })
    this.emitQueueChanged()
    const trackId = currentTrackId(queue)
    if (!trackId) {
      this.commit({ status: 'idle', trackId: null, positionMs: 0, durationMs: 0 })
      return
    }
    await this.loadAndMaybePlay(trackId, 0, autoplay)
  }

  /** Play a track, optionally inside a list (album, playlist, search results). */
  async playTrack(trackId: string, contextIds?: string[]): Promise<void> {
    const ids = contextIds && contextIds.length > 0 ? contextIds : [trackId]
    const index = Math.max(0, ids.indexOf(trackId))
    const queue = this.buildQueue(ids, index)
    this.commit({ queue, error: null })
    this.emitQueueChanged()
    await this.loadAndMaybePlay(trackId, 0, true)
  }

  /** Start a shuffled queue at a random track while keeping album order restorable. */
  async playShuffled(ids: string[], random: () => number = Math.random): Promise<void> {
    if (ids.length === 0) return
    const base = createQueue(ids, 0, this.state.queue.repeat)
    const shuffled = setShuffle(base, true, random)
    const index = Math.floor(random() * shuffled.ids.length)
    const queue: QueueState = { ...shuffled, index: Math.min(index, shuffled.ids.length - 1) }
    const trackId = currentTrackId(queue)
    this.commit({ queue, error: null })
    this.emitQueueChanged()
    if (trackId) await this.loadAndMaybePlay(trackId, 0, true)
  }

  async toggle(): Promise<void> {
    if (this.state.status === 'playing') {
      await this.pause()
      return
    }
    await this.play()
  }

  async play(): Promise<void> {
    const trackId = this.state.trackId
    if (!trackId) {
      const nextId = currentTrackId(this.state.queue)
      if (!nextId) return
      await this.loadAndMaybePlay(nextId, 0, true)
      return
    }
    if (this.state.status === 'error') {
      await this.loadAndMaybePlay(trackId, this.state.positionMs, true)
      return
    }
    try {
      await this.backend.play()
      this.commit({ status: 'playing', error: null })
    } catch (error) {
      this.fail(trackId, error)
    }
  }

  async pause(): Promise<void> {
    await this.backend.pause()
    if (this.state.status !== 'error') this.commit({ status: 'paused' })
  }

  async seek(positionMs: number): Promise<void> {
    const duration = this.state.durationMs
    const target = Math.max(0, duration > 0 ? Math.min(positionMs, duration) : positionMs)
    await this.backend.seek(target)
    this.commit({ positionMs: target })
  }

  /** Manual next: repeat-one does not trap the user on the same track. */
  async next(): Promise<void> {
    if (isEmpty(this.state.queue)) return
    const result = advance(this.state.queue, { ignoreRepeatOne: true })
    // At the end of a non-repeating queue, an explicit skip does nothing rather
    // than silently stopping playback.
    if (result.kind === 'stop') return
    this.commit({ queue: result.queue, error: null })
    this.emitQueueChanged()
    await this.loadAndMaybePlay(result.id, 0, true)
  }

  async previous(): Promise<void> {
    if (this.state.positionMs > RESTART_THRESHOLD_MS) {
      await this.seek(0)
      return
    }
    const result = retreat(this.state.queue)
    if (result.kind === 'stop') return
    this.commit({ queue: result.queue, error: null })
    this.emitQueueChanged()
    await this.loadAndMaybePlay(result.id, 0, true)
  }

  async jumpToIndex(index: number): Promise<void> {
    const queue = jumpTo(this.state.queue, index)
    const trackId = currentTrackId(queue)
    this.commit({ queue, error: null })
    this.emitQueueChanged()
    if (trackId) await this.loadAndMaybePlay(trackId, 0, true)
  }

  async setVolume(volume: number): Promise<void> {
    const value = clamp01(volume)
    this.commit({ volume: value })
    await this.backend.setVolume(value)
  }

  async toggleMute(): Promise<void> {
    const muted = !this.state.muted
    this.commit({ muted })
    await this.backend.setMuted(muted)
  }

  setShuffle(enabled: boolean): void {
    const queue = setShuffle(this.state.queue, enabled)
    if (queue === this.state.queue) return
    this.commit({ queue })
    this.emitQueueChanged()
  }

  setRepeat(mode: RepeatMode): void {
    this.commit({ queue: setRepeat(this.state.queue, mode) })
    this.emitQueueChanged()
  }

  cycleRepeat(): void {
    const order: RepeatMode[] = ['off', 'all', 'one']
    const currentIndex = order.indexOf(this.state.queue.repeat)
    this.setRepeat(order[(currentIndex + 1) % order.length] as RepeatMode)
  }

  async removeFromQueue(index: number): Promise<void> {
    const wasCurrent = index === this.state.queue.index
    const queue = removeAt(this.state.queue, index)
    this.commit({ queue })
    this.emitQueueChanged()
    if (!wasCurrent) return
    const trackId = currentTrackId(queue)
    if (!trackId) {
      this.commit({ status: 'idle', trackId: null, positionMs: 0, durationMs: 0 })
      return
    }
    await this.loadAndMaybePlay(trackId, 0, this.state.status === 'playing')
  }

  /** Insert directly after the current track without starting playback. */
  async playNext(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const wasEmpty = isEmpty(this.state.queue)
    const queue = insertNext(this.state.queue, ids)
    this.commit({ queue })
    this.emitQueueChanged()
    if (wasEmpty) {
      const trackId = currentTrackId(queue)
      if (trackId) await this.loadAndMaybePlay(trackId, 0, true)
    }
  }

  async addToQueue(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    const queue = append(this.state.queue, ids)
    this.commit({ queue })
    this.emitQueueChanged()
    if (!this.state.trackId) {
      const trackId = currentTrackId(queue)
      if (trackId) await this.loadAndMaybePlay(trackId, 0, true)
    }
  }

  async clearQueue(): Promise<void> {
    await this.backend.pause()
    const queue = clear(this.state.queue)
    this.commit({ queue, status: 'idle', trackId: null, positionMs: 0, durationMs: 0, error: null })
    this.emitQueueChanged()
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.unsubscribeBackend()
    await this.backend.dispose()
    this.listeners.clear()
  }

  /* ----------------------------- internals ----------------------------- */

  private buildQueue(ids: string[], startIndex: number): QueueState {
    const base = createQueue(ids, startIndex, this.state.queue.repeat)
    return this.state.queue.shuffle ? setShuffle(base, true) : base
  }

  private async loadAndMaybePlay(trackId: string, positionMs: number, autoplay: boolean): Promise<void> {
    const generation = ++this.generation
    this.commit({ status: 'loading', trackId, positionMs, durationMs: 0, error: null })

    let source: PlaybackSource | null = null
    try {
      source = await this.resolveSource(trackId)
    } catch (error) {
      if (generation === this.generation) this.fail(trackId, error)
      return
    }
    if (generation !== this.generation || this.disposed) return
    if (!source) {
      this.fail(trackId, new Error('This file is missing from disk. Rescan the folder or remove the track.'))
      return
    }

    try {
      await this.backend.load(source)
    } catch (error) {
      if (generation === this.generation) this.fail(trackId, error)
      return
    }
    if (generation !== this.generation || this.disposed) return

    if (positionMs > 0) {
      await this.backend.seek(positionMs)
      this.commit({ positionMs })
    }
    await this.backend.setVolume(this.state.volume)
    await this.backend.setMuted(this.state.muted)

    const durationMs = this.backend.getDurationMs() || source.durationHintMs || 0
    this.commit({ durationMs, positionMs: positionMs > 0 ? positionMs : 0 })

    if (autoplay) {
      try {
        await this.backend.play()
        this.commit({ status: 'playing' })
        this.options.onTrackStarted?.(trackId)
      } catch (error) {
        this.fail(trackId, error)
      }
    } else {
      this.commit({ status: 'paused' })
    }
  }

  private handleBackendEvent(event: PlaybackBackendEvent): void {
    if (this.disposed) return
    switch (event.type) {
      case 'loaded':
        this.commit({ durationMs: event.durationMs })
        break
      case 'position':
        if (this.state.status !== 'error') this.commit({ positionMs: event.positionMs })
        break
      case 'playing':
        this.commit({ status: 'playing', error: null })
        break
      case 'paused':
        if (this.state.status === 'playing') this.commit({ status: 'paused' })
        break
      case 'ended':
        void this.handleEnded()
        break
      case 'error':
        this.fail(this.state.trackId, new Error(event.message))
        break
    }
  }

  private async handleEnded(): Promise<void> {
    const result = advance(this.state.queue)
    if (result.kind === 'stop') {
      this.commit({ status: 'idle', positionMs: this.state.durationMs })
      return
    }
    this.commit({ queue: result.queue, error: null })
    this.emitQueueChanged()
    await this.loadAndMaybePlay(result.id, 0, true)
  }

  private fail(trackId: string | null, error: unknown): void {
    const message = normaliseError(error)
    const playerError: PlayerError = { message, trackId }
    this.commit({ status: 'error', error: playerError })
    this.options.onError?.(playerError)
  }

  private commit(patch: Partial<PlayerState>): void {
    this.state = { ...this.state, ...patch }
    this.options.onState?.(this.state)
    for (const listener of this.listeners) listener(this.state)
  }

  private emitQueueChanged(): void {
    if (this.pendingQueueSync) return
    this.pendingQueueSync = true
    queueMicrotask(() => {
      this.pendingQueueSync = false
      this.options.onQueueChanged?.(this.state.queue)
    })
  }
}

function normaliseError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return 'Playback failed for an unknown reason.'
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}
