/**
 * Bunny Sync — interfaces only.
 *
 * Sprint 1 does not implement networking, device discovery, clock
 * synchronisation or remote playback. Defining the contracts now keeps the
 * playback layer ready for it without shipping a fake implementation.
 *
 * Planned design (Sprint 3+):
 *  - Devices announce identity + capabilities on the local network (mDNS/WS).
 *  - Sessions carry an authoritative timeline: trackId, startEpochMs, rate.
 *  - Followers estimate clock offset with a four-timestamp exchange and derive
 *    the expected position; drift above ~150 ms triggers a corrective seek.
 *  - A leader accepts transport commands, broadcasts state revisions, and
 *    followers reconcile by revision number rather than by command replay.
 */

export interface DeviceCapabilities {
  audioOutput: boolean
  videoOutput: boolean
  localLibrary: boolean
  canLead: boolean
}

export interface DeviceIdentity {
  deviceId: string
  displayName: string
  platform: 'bunnyos' | 'windows' | 'macos' | 'linux' | 'mobile'
  capabilities: DeviceCapabilities
}

export interface PlaybackTimeline {
  trackId: string
  /** Epoch milliseconds at which the track was at `positionMs`. */
  anchorEpochMs: number
  positionMs: number
  rate: 0 | 1
  revision: number
}

export interface ClockSample {
  clientSentEpochMs: number
  serverReceivedEpochMs: number
  serverSentEpochMs: number
  clientReceivedEpochMs: number
}

export interface ClockEstimate {
  offsetMs: number
  roundTripMs: number
  sampledAtEpochMs: number
}

export type RemoteCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; positionMs: number }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'set-volume'; volume: number }

export interface SyncSession {
  sessionId: string
  leaderDeviceId: string
  timeline: PlaybackTimeline
  members: DeviceIdentity[]
}

/** Transport contract a future sync implementation must provide. */
export interface SyncTransport {
  start(identity: DeviceIdentity): Promise<void>
  stop(): Promise<void>
  discover(): Promise<DeviceIdentity[]>
  joinSession(sessionId: string): Promise<SyncSession>
  leaveSession(): Promise<void>
  publishTimeline(timeline: PlaybackTimeline): Promise<void>
  sendCommand(deviceId: string, command: RemoteCommand): Promise<void>
  onTimeline(listener: (timeline: PlaybackTimeline) => void): () => void
  onDevices(listener: (devices: DeviceIdentity[]) => void): () => void
}

/** Derive the expected position for a timeline at a wall-clock time. */
export function expectedPosition(timeline: PlaybackTimeline, nowEpochMs: number): number {
  if (timeline.rate === 0) return timeline.positionMs
  return Math.max(0, timeline.positionMs + (nowEpochMs - timeline.anchorEpochMs))
}

/** Offset estimate from a single four-timestamp exchange. */
export function estimateClockOffset(sample: ClockSample): ClockEstimate {
  const roundTripMs = Math.max(
    0,
    sample.clientReceivedEpochMs - sample.clientSentEpochMs - (sample.serverSentEpochMs - sample.serverReceivedEpochMs)
  )
  const offsetMs =
    (sample.serverReceivedEpochMs - sample.clientSentEpochMs + (sample.serverSentEpochMs - sample.clientReceivedEpochMs)) / 2
  return { offsetMs, roundTripMs, sampledAtEpochMs: sample.clientReceivedEpochMs }
}
