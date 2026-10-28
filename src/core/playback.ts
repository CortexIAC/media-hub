/** Playback backend contract. The UI never talks to an audio element directly. */

export interface PlaybackSource {
  trackId: string
  /** URL the backend can load (bunny-media:// in the Electron renderer). */
  url: string
  /** Metadata duration, used until the decoder reports its own. */
  durationHintMs: number
}

export type PlaybackBackendEvent =
  | { type: 'loaded'; durationMs: number }
  | { type: 'position'; positionMs: number }
  | { type: 'playing' }
  | { type: 'paused' }
  | { type: 'ended' }
  | { type: 'error'; message: string }

export interface PlaybackBackend {
  readonly kind: string
  load(source: PlaybackSource): Promise<void>
  play(): Promise<void>
  pause(): Promise<void>
  seek(positionMs: number): Promise<void>
  setVolume(volume: number): Promise<void>
  setMuted(muted: boolean): Promise<void>
  getPositionMs(): number
  getDurationMs(): number
  dispose(): Promise<void>
  onEvent(listener: (event: PlaybackBackendEvent) => void): () => void
}
