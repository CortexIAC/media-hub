import type { EqualizerSettings } from '@core/models'
import { DEFAULT_EQUALIZER, EQ_FREQUENCIES, equalizerNeedsGraph } from '@core/models'
import type { PlaybackBackend, PlaybackBackendEvent, PlaybackSource } from '@core/playback'

/**
 * Chromium audio backend.
 *
 * Wraps a single HTMLAudioElement behind the PlaybackBackend contract so the
 * controller and UI never depend on DOM media APIs. A future native backend can
 * replace this class without touching the interface.
 */
export class HtmlAudioBackend implements PlaybackBackend {
  readonly kind = 'html-audio'
  private readonly audio: HTMLAudioElement
  private readonly listeners = new Set<(event: PlaybackBackendEvent) => void>()
  private pendingLoad = false
  private durationMs = 0
  private disposed = false
  private context: AudioContext | null = null
  private filters: BiquadFilterNode[] = []
  private bassFilter: BiquadFilterNode | null = null
  private boostGain: GainNode | null = null
  private equalizer: EqualizerSettings = DEFAULT_EQUALIZER

  constructor() {
    this.audio = new Audio()
    this.audio.preload = 'auto'
    // CORS mode is what lets Web Audio read the decoded samples. Without it the
    // equalizer graph receives silence from a cross-origin resource, even though
    // the element itself plays and its clock advances.
    this.audio.crossOrigin = 'anonymous'
    this.audio.addEventListener('loadedmetadata', () => {
      this.durationMs = normaliseDuration(this.audio.duration)
      this.emit({ type: 'loaded', durationMs: this.durationMs })
    })
    this.audio.addEventListener('durationchange', () => {
      const duration = normaliseDuration(this.audio.duration)
      if (duration > 0 && Math.abs(duration - this.durationMs) > 250) {
        this.durationMs = duration
        this.emit({ type: 'loaded', durationMs: duration })
      }
    })
    this.audio.addEventListener('timeupdate', () => {
      this.emit({ type: 'position', positionMs: this.audio.currentTime * 1000 })
    })
    this.audio.addEventListener('play', () => this.emit({ type: 'playing' }))
    this.audio.addEventListener('pause', () => this.emit({ type: 'paused' }))
    this.audio.addEventListener('ended', () => this.emit({ type: 'ended' }))
    this.audio.addEventListener('error', () => {
      if (this.pendingLoad) return
      this.emit({ type: 'error', message: describeMediaError(this.audio.error) })
    })
  }

  async load(source: PlaybackSource): Promise<void> {
    this.pendingLoad = true
    this.durationMs = 0
    const audio = this.audio

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const timeout = window.setTimeout(() => {
        settle(new Error('The player took too long to read this file.'))
      }, 12_000)

      const settle = (error?: Error): void => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        audio.removeEventListener('loadedmetadata', onLoaded)
        audio.removeEventListener('error', onError)
        this.pendingLoad = false
        if (error) reject(error)
        else resolve()
      }

      const onLoaded = (): void => settle()
      const onError = (): void => settle(new Error(describeMediaError(audio.error)))

      audio.addEventListener('loadedmetadata', onLoaded, { once: true })
      audio.addEventListener('error', onError, { once: true })

      try {
        audio.pause()
        audio.src = source.url
        audio.load()
      } catch (error) {
        settle(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  /**
   * Stores the desired EQ curve and applies it when the audio graph exists.
   * The graph is created lazily from a user gesture (play / moving a slider),
   * because a suspended AudioContext would silence the element.
   */
  applyEqualizer(settings: EqualizerSettings, allowCreate = false): void {
    this.equalizer = {
      enabled: settings.enabled,
      bands: [...settings.bands],
      boost: settings.boost,
      bassBoost: settings.bassBoost
    }
    if (this.context) {
      this.writeGains()
    } else if (allowCreate && equalizerNeedsGraph(this.equalizer)) {
      // Called from a slider drag, which is a user gesture: safe to build and
      // start the audio graph immediately.
      void this.ensureGraph()
    }
  }

  async play(): Promise<void> {
    try {
      if (equalizerNeedsGraph(this.equalizer)) await this.ensureGraph()
      // A context that Chromium suspended while paused would silence the
      // element even though the clock keeps running, so always resume it.
      if (this.context && this.context.state === 'suspended') {
        await this.context.resume().catch(() => undefined)
      }
      await this.audio.play()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        throw new Error('Playback was blocked by the system. Press play again.')
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Playback was interrupted. Try again.')
      }
      throw new Error(describeMediaError(this.audio.error) || 'The file could not be played.')
    }
  }

  async pause(): Promise<void> {
    this.audio.pause()
  }

  async seek(positionMs: number): Promise<void> {
    if (!Number.isFinite(positionMs)) return
    const seconds = Math.max(0, positionMs / 1000)
    if (this.audio.readyState === 0) return
    try {
      this.audio.currentTime = seconds
    } catch {
      // Seeking can throw before metadata is available; the controller will
      // retry through normal transport actions.
    }
  }

  async setVolume(volume: number): Promise<void> {
    this.audio.volume = Math.min(1, Math.max(0, volume))
  }

  async setMuted(muted: boolean): Promise<void> {
    this.audio.muted = muted
  }

  getPositionMs(): number {
    return this.audio.currentTime * 1000
  }

  getDurationMs(): number {
    return normaliseDuration(this.audio.duration) || this.durationMs
  }

  onEvent(listener: (event: PlaybackBackendEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.listeners.clear()
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    for (const filter of this.filters) filter.disconnect()
    this.filters = []
    this.bassFilter?.disconnect()
    this.bassFilter = null
    this.boostGain?.disconnect()
    this.boostGain = null
    void this.context?.close().catch(() => undefined)
    this.context = null
  }

  private async ensureGraph(): Promise<void> {
    if (this.context) {
      if (this.context.state === 'suspended') await this.context.resume().catch(() => undefined)
      return
    }
    try {
      const context = new AudioContext()
      const source = context.createMediaElementSource(this.audio)
      let previous: AudioNode = source
      this.filters = EQ_FREQUENCIES.map((frequency) => {
        const filter = context.createBiquadFilter()
        filter.type = frequency <= 120 ? 'lowshelf' : frequency >= 8000 ? 'highshelf' : 'peaking'
        filter.frequency.value = frequency
        filter.Q.value = 1.1
        filter.gain.value = 0
        previous.connect(filter)
        previous = filter
        return filter
      })

      // Dedicated low shelf for the "extra bass" slider, independent of the
      // graphic EQ bands.
      const bass = context.createBiquadFilter()
      bass.type = 'lowshelf'
      bass.frequency.value = 80
      bass.gain.value = 0
      previous.connect(bass)
      previous = bass

      // Output boost, then a soft limiter so a 2-3x boost clips gracefully
      // instead of producing hard digital distortion.
      const boost = context.createGain()
      boost.gain.value = 1
      previous.connect(boost)
      previous = boost

      const limiter = context.createDynamicsCompressor()
      limiter.threshold.value = -1.5
      limiter.knee.value = 0
      limiter.ratio.value = 20
      limiter.attack.value = 0.003
      limiter.release.value = 0.25
      previous.connect(limiter)
      previous = limiter

      previous.connect(context.destination)

      this.bassFilter = bass
      this.boostGain = boost
      this.context = context
      this.writeGains()

      // Chromium can suspend an idle context (for example after a long pause).
      // Resume automatically while the element is actually playing, otherwise
      // the audio would stay silent after unpausing.
      context.addEventListener('statechange', () => {
        if (!this.disposed && this.audio.paused === false && context.state === 'suspended') {
          void context.resume().catch(() => undefined)
        }
      })

      if (context.state === 'suspended') await context.resume().catch(() => undefined)
    } catch (error) {
      // A failed graph must never break playback: the element keeps its direct
      // output until the filters are removed from the chain.
      console.warn('[audio] equalizer unavailable', error)
      this.context = null
      this.filters = []
    }
  }

  private writeGains(): void {
    const target = this.equalizer.enabled ? this.equalizer.bands : []
    this.filters.forEach((filter, index) => {
      filter.gain.value = target[index] ?? 0
    })
    if (this.bassFilter) this.bassFilter.gain.value = this.equalizer.bassBoost
    // Linear boost from 1x to 3x; the limiter keeps peaks in range.
    if (this.boostGain) this.boostGain.gain.value = this.equalizer.boost
  }

  private emit(event: PlaybackBackendEvent): void {
    if (this.disposed) return
    for (const listener of this.listeners) listener(event)
  }
}

function normaliseDuration(value: number): number {
  return Number.isFinite(value) && value > 0 ? value * 1000 : 0
}

export function describeMediaError(error: MediaError | null): string {
  if (!error) return 'The file could not be played.'
  switch (error.code) {
    case 1:
      return 'Playback was aborted.'
    case 2:
      return 'The file could not be read from disk.'
    case 3:
      return 'This file could not be decoded. It may be corrupt or use a codec this build does not support.'
    case 4:
      return 'This audio format is not supported by the current playback engine.'
    default:
      return 'The file could not be played.'
  }
}
