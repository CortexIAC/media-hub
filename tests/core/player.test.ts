import { describe, expect, it } from 'vitest'
import { PlayerController } from '@core/player'
import type { PlaybackBackend, PlaybackBackendEvent, PlaybackSource } from '@core/playback'

class FakeBackend implements PlaybackBackend {
  readonly kind = 'fake'
  loaded: PlaybackSource | null = null
  loads: PlaybackSource[] = []
  seekCalls: number[] = []
  volume = 1
  muted = false
  played = 0
  disposed = false
  failNextLoad: string | null = null
  private position = 0
  private duration = 0
  private listeners = new Set<(event: PlaybackBackendEvent) => void>()

  async load(source: PlaybackSource): Promise<void> {
    if (this.failNextLoad) {
      const message = this.failNextLoad
      this.failNextLoad = null
      throw new Error(message)
    }
    this.loaded = source
    this.loads.push(source)
    this.duration = source.durationHintMs
    this.emit({ type: 'loaded', durationMs: this.duration })
  }

  async play(): Promise<void> {
    this.played += 1
    this.emit({ type: 'playing' })
  }

  async pause(): Promise<void> {
    this.emit({ type: 'paused' })
  }

  async seek(positionMs: number): Promise<void> {
    this.position = positionMs
    this.seekCalls.push(positionMs)
  }

  async setVolume(volume: number): Promise<void> {
    this.volume = volume
  }

  async setMuted(muted: boolean): Promise<void> {
    this.muted = muted
  }

  getPositionMs(): number {
    return this.position
  }

  getDurationMs(): number {
    return this.duration
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.listeners.clear()
  }

  onEvent(listener: (event: PlaybackBackendEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(event: PlaybackBackendEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}

const DURATIONS: Record<string, number> = { a: 1000, b: 2000, c: 3000, d: 4000, e: 5000 }

function makeController(overrides: { missing?: string[]; failLoad?: string } = {}) {
  const backend = new FakeBackend()
  if (overrides.failLoad) backend.failNextLoad = overrides.failLoad
  const errors: Array<{ message: string; trackId: string | null }> = []
  const started: string[] = []
  const controller = new PlayerController({
    backend,
    resolveSource: async (trackId) =>
      overrides.missing?.includes(trackId)
        ? null
        : { trackId, url: `fake://${trackId}`, durationHintMs: DURATIONS[trackId] ?? 1000 },
    onError: (error) => errors.push(error),
    onTrackStarted: (trackId) => started.push(trackId),
    initialVolume: 0.5,
    initialMuted: false
  } as ConstructorParameters<typeof PlayerController>[0])
  return { backend, controller, errors, started }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
}

describe('PlayerController transport', () => {
  it('loads a track, reports duration and starts playback', async () => {
    const { backend, controller } = makeController()
    await controller.playTrack('a')
    const state = controller.getState()
    expect(state.status).toBe('playing')
    expect(state.trackId).toBe('a')
    expect(state.durationMs).toBe(1000)
    expect(state.queue.ids).toEqual(['a'])
    expect(backend.loaded?.url).toBe('fake://a')
    expect(backend.played).toBe(1)
    expect(backend.volume).toBe(0.5)
  })

  it('queues a playback context and advances within it', async () => {
    const { controller } = makeController()
    await controller.playTrack('b', ['a', 'b', 'c'])
    expect(controller.getState().queue.ids).toEqual(['a', 'b', 'c'])
    expect(controller.getState().queue.index).toBe(1)
    await controller.next()
    expect(controller.getState().trackId).toBe('c')
    await controller.previous()
    expect(controller.getState().trackId).toBe('b')
  })

  it('pauses and resumes', async () => {
    const { controller } = makeController()
    await controller.playTrack('a')
    await controller.toggle()
    expect(controller.getState().status).toBe('paused')
    await controller.toggle()
    expect(controller.getState().status).toBe('playing')
  })

  it('clamps seek to the duration and reports position events', async () => {
    const { backend, controller } = makeController()
    await controller.playTrack('b')
    await controller.seek(999_999)
    expect(backend.seekCalls.at(-1)).toBe(2000)
    expect(controller.getState().positionMs).toBe(2000)

    backend.emit({ type: 'position', positionMs: 750 })
    expect(controller.getState().positionMs).toBe(750)
  })

  it('restarts the track on previous after three seconds', async () => {
    const { backend, controller } = makeController()
    await controller.playTrack('e', ['d', 'e'])
    await controller.seek(4000)
    await controller.previous()
    expect(controller.getState().trackId).toBe('e')
    expect(backend.seekCalls.at(-1)).toBe(0)
  })

  it('does nothing on next at the end of a non-repeating queue', async () => {
    const { controller } = makeController()
    await controller.playTrack('c', ['a', 'b', 'c'])
    await controller.next()
    const state = controller.getState()
    expect(state.trackId).toBe('c')
    expect(state.status).toBe('playing')
  })

  it('clamps volume and toggles mute', async () => {
    const { backend, controller } = makeController()
    await controller.setVolume(3)
    expect(controller.getState().volume).toBe(1)
    expect(backend.volume).toBe(1)
    await controller.setVolume(-2)
    expect(controller.getState().volume).toBe(0)
    await controller.toggleMute()
    expect(controller.getState().muted).toBe(true)
    expect(backend.muted).toBe(true)
  })
})

describe('PlayerController queue behaviour', () => {
  it('advances automatically when a track ends', async () => {
    const { backend, controller } = makeController()
    await controller.playTrack('a', ['a', 'b'])
    backend.emit({ type: 'ended' })
    await settle()
    expect(controller.getState().trackId).toBe('b')
    expect(controller.getState().status).toBe('playing')
  })

  it('repeats the same track when repeat-one is set', async () => {
    const { backend, controller } = makeController()
    await controller.playTrack('a')
    controller.setRepeat('one')
    backend.emit({ type: 'ended' })
    await settle()
    expect(controller.getState().trackId).toBe('a')
    expect(backend.loads.filter((source) => source.trackId === 'a')).toHaveLength(2)
  })

  it('wraps to the first track with repeat-all and stops at the end otherwise', async () => {
    const { backend, controller } = makeController()
    await controller.playTrack('b', ['a', 'b'])
    controller.setRepeat('all')
    backend.emit({ type: 'ended' })
    await settle()
    expect(controller.getState().trackId).toBe('a')

    controller.setRepeat('off')
    await controller.jumpToIndex(1)
    backend.emit({ type: 'ended' })
    await settle()
    expect(controller.getState().status).toBe('idle')
  })

  it('removing the current track loads the next one', async () => {
    const { controller } = makeController()
    await controller.playTrack('a', ['a', 'b', 'c'])
    await controller.removeFromQueue(0)
    expect(controller.getState().trackId).toBe('b')
    expect(controller.getState().queue.ids).toEqual(['b', 'c'])
  })

  it('starts playback when tracks are added to an idle queue', async () => {
    const { controller } = makeController()
    await controller.addToQueue(['c'])
    expect(controller.getState().trackId).toBe('c')
    expect(controller.getState().status).toBe('playing')
  })

  it('inserts immediately after the current track with playNext', async () => {
    const { controller } = makeController()
    await controller.playTrack('a', ['a', 'c'])
    await controller.playNext(['b'])
    expect(controller.getState().queue.ids).toEqual(['a', 'b', 'c'])
    expect(controller.getState().trackId).toBe('a')
  })

  it('clears the queue and stops playback', async () => {
    const { controller } = makeController()
    await controller.playTrack('a')
    await controller.clearQueue()
    expect(controller.getState().queue.ids).toEqual([])
    expect(controller.getState().status).toBe('idle')
    expect(controller.getState().trackId).toBeNull()
  })

  it('shuffles without changing the current track and restores order', async () => {
    const { controller } = makeController()
    await controller.playTrack('b', ['a', 'b', 'c', 'd'])
    controller.setShuffle(true)
    expect(controller.getState().queue.shuffle).toBe(true)
    expect(controller.getState().trackId).toBe('b')
    expect(new Set(controller.getState().queue.ids)).toEqual(new Set(['a', 'b', 'c', 'd']))
    controller.setShuffle(false)
    expect(controller.getState().queue.ids).toEqual(['a', 'b', 'c', 'd'])
    expect(controller.getState().trackId).toBe('b')
  })

  it('starts a shuffled queue on a playable track', async () => {
    const { controller } = makeController()
    await controller.playShuffled(['a', 'b', 'c', 'd'])
    const state = controller.getState()
    expect(state.queue.shuffle).toBe(true)
    expect(state.queue.ids).toHaveLength(4)
    expect(state.status).toBe('playing')
    expect(state.trackId).not.toBeNull()
    expect(state.queue.ids).toContain(state.trackId)
  })
})

describe('PlayerController errors and restore', () => {
  it('reports a missing file and recovers on next', async () => {
    const { controller, errors } = makeController({ missing: ['a'] })
    await controller.playTrack('a', ['a', 'b'])
    expect(controller.getState().status).toBe('error')
    expect(errors.at(-1)?.message).toMatch(/missing/i)
    expect(controller.getState().queue.ids).toEqual(['a', 'b'])

    await controller.next()
    expect(controller.getState().status).toBe('playing')
    expect(controller.getState().trackId).toBe('b')
  })

  it('reports a backend load failure and retries the same track on play', async () => {
    const { controller, errors } = makeController({ failLoad: 'decoder exploded' })
    await controller.playTrack('a')
    expect(controller.getState().status).toBe('error')
    expect(errors.at(-1)?.message).toBe('decoder exploded')

    await controller.play()
    expect(controller.getState().status).toBe('playing')
    expect(controller.getState().error).toBeNull()
  })

  it('restores a saved session paused at the saved position', async () => {
    const { backend, controller } = makeController()
    await controller.restore({
      trackId: 'c',
      queueIds: ['a', 'b', 'c'],
      queueIndex: 2,
      positionMs: 500,
      updatedAt: Date.now()
    })
    const state = controller.getState()
    expect(state.status).toBe('paused')
    expect(state.trackId).toBe('c')
    expect(state.positionMs).toBe(500)
    expect(backend.seekCalls).toContain(500)
    expect(state.queue.ids).toEqual(['a', 'b', 'c'])
  })

  it('ignores an empty session', async () => {
    const { controller } = makeController()
    await controller.restore(null)
    expect(controller.getState().status).toBe('idle')
  })

  it('disposes the backend', async () => {
    const { backend, controller } = makeController()
    await controller.playTrack('a')
    await controller.dispose()
    expect(backend.disposed).toBe(true)
  })
})
