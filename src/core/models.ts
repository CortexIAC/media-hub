/**
 * Core domain models. This module must stay free of Electron, Node and DOM
 * imports so that it can be unit tested and reused by any playback backend.
 */

export const UNKNOWN_ARTIST = 'Unknown Artist'
export const UNKNOWN_ALBUM = 'Unknown Album'

export type TrackIssue =
  | 'missing-metadata'
  | 'unreadable'
  | 'missing-file'
  | 'decode-error'

export interface Track {
  /** Stable id derived from the absolute file path. */
  id: string
  path: string
  folderId: string
  title: string
  artist: string
  albumArtist: string
  album: string
  trackNo: number | null
  discNo: number | null
  year: number | null
  genre: string | null
  durationMs: number
  codec: string | null
  container: string | null
  bitrate: number | null
  sampleRate: number | null
  channels: number | null
  lossless: boolean
  /** Cache key for extracted cover art, or null when none was embedded. */
  artworkId: string | null
  /** Raw lyrics text (LRC or plain), when found locally. */
  lyrics: string | null
  lyricsSource: 'embedded' | 'sidecar' | null
  fileSize: number
  mtimeMs: number
  addedAt: number
  updatedAt: number
  issues: TrackIssue[]
}

export interface LibraryFolder {
  id: string
  path: string
  name: string
  addedAt: number
  lastScanAt: number | null
}

export interface LibrarySnapshot {
  folders: LibraryFolder[]
  tracks: Track[]
  /** Non-fatal problems from the most recent scan of each folder. */
  lastScan: ScanSummary | null
}

export interface SkippedFile {
  path: string
  extension: string
  reason: 'unsupported-format' | 'too-large'
}

export interface ScanSummary {
  folderId: string
  folderPath: string
  startedAt: number
  finishedAt: number
  filesSeen: number
  tracksAdded: number
  tracksUpdated: number
  tracksUnchanged: number
  tracksRemoved: number
  failures: Array<{ path: string; message: string }>
  skipped: SkippedFile[]
  cancelled: boolean
  truncated: boolean
}

export interface ScanProgress {
  folderId: string
  folderPath: string
  phase: 'walking' | 'reading' | 'finalizing'
  filesSeen: number
  tracksFound: number
  currentFile: string | null
  startedAt: number
}

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
  createdAt: number
  updatedAt: number
}

export type RepeatMode = 'off' | 'all' | 'one'

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

export interface PlaybackSession {
  trackId: string | null
  queueIds: string[]
  queueIndex: number
  positionMs: number
  updatedAt: number
}

export interface EqualizerSettings {
  enabled: boolean
  /** Gain in dB per band, in the same order as EQ_FREQUENCIES. */
  bands: number[]
  /** Output gain multiplier applied after the EQ (1 = no boost). */
  boost: number
  /** Extra low-shelf boost in dB, independent of the graphic EQ. */
  bassBoost: number
}

export const BOOST_MIN = 1

export const BOOST_MAX = 3

export const BASS_BOOST_MAX = 12

export const EQ_FREQUENCIES = [60, 230, 910, 3600, 14_000] as const

export const EQ_BAND_LABELS = ['Sub-bass', 'Bass', 'Mids', 'Presence', 'Air'] as const

export const EQ_MIN_DB = -12

export const EQ_MAX_DB = 12

export type EqualizerPresetId = 'flat' | 'bass' | 'vocal' | 'rock' | 'electronic'

export interface EqualizerPreset {
  id: EqualizerPresetId
  name: string
  bands: readonly number[]
}

export const EQ_PRESETS: readonly EqualizerPreset[] = [
  { id: 'flat', name: 'Flat', bands: [0, 0, 0, 0, 0] },
  { id: 'bass', name: 'Bass boost', bands: [7, 5, 0, -1, -1] },
  { id: 'vocal', name: 'Vocals', bands: [-2, 0, 4, 5, 1] },
  { id: 'rock', name: 'Rock', bands: [5, 3, -1, 3, 5] },
  { id: 'electronic', name: 'Electronic', bands: [6, 3, -2, 2, 4] }
]

export const DEFAULT_EQUALIZER: EqualizerSettings = {
  enabled: false,
  bands: [0, 0, 0, 0, 0],
  boost: 1,
  bassBoost: 0
}

export interface AppSettings {
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  scanOnStartup: boolean
  accent: string
  equalizer: EqualizerSettings
  /** Optional YouTube Data API v3 key; empty means YouTube search is off. */
  youtubeApiKey: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  volume: 0.8,
  muted: false,
  shuffle: false,
  repeat: 'off',
  scanOnStartup: false,
  accent: '#3ddc84',
  equalizer: DEFAULT_EQUALIZER,
  youtubeApiKey: ''
}

/** Coerces stored or user-supplied EQ values into something safe to apply. */
export function sanitizeEqualizer(raw: unknown): EqualizerSettings {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<EqualizerSettings>
  const bands = Array.isArray(source.bands) ? source.bands : []
  const boost = typeof source.boost === 'number' && Number.isFinite(source.boost) ? source.boost : 1
  const bassBoost =
    typeof source.bassBoost === 'number' && Number.isFinite(source.bassBoost) ? source.bassBoost : 0
  return {
    enabled: source.enabled === true,
    bands: EQ_FREQUENCIES.map((_frequency, index) => {
      const value = bands[index]
      if (typeof value !== 'number' || !Number.isFinite(value)) return 0
      return Math.min(EQ_MAX_DB, Math.max(EQ_MIN_DB, Math.round(value * 10) / 10))
    }),
    boost: Math.min(BOOST_MAX, Math.max(BOOST_MIN, Math.round(boost * 100) / 100)),
    bassBoost: Math.min(BASS_BOOST_MAX, Math.max(0, Math.round(bassBoost * 10) / 10))
  }
}

export function equalizerIsFlat(equalizer: EqualizerSettings): boolean {
  return (
    equalizer.bands.every((gain) => Math.abs(gain) < 0.05) &&
    equalizer.boost <= 1.005 &&
    equalizer.bassBoost < 0.05
  )
}

/** True when the audio graph must exist for the current settings. */
export function equalizerNeedsGraph(equalizer: EqualizerSettings): boolean {
  return equalizer.enabled || equalizer.boost > 1.005 || equalizer.bassBoost >= 0.05
}

/** File extensions the scanner will attempt to read. */
export const SUPPORTED_AUDIO_EXTENSIONS = [
  '.mp3',
  '.m4a',
  '.m4b',
  '.aac',
  '.flac',
  '.wav',
  '.ogg',
  '.oga',
  '.opus',
  '.webm'
] as const

/**
 * Extensions that are recognisably audio but are not claimed as supported.
 * They are counted and reported during a scan instead of silently vanishing.
 */
export const UNSUPPORTED_AUDIO_EXTENSIONS = [
  '.wma',
  '.ape',
  '.alac',
  '.aiff',
  '.aif',
  '.wv',
  '.dsf',
  '.dff',
  '.mid',
  '.midi',
  '.m4p'
] as const

export function isSupportedAudioExtension(ext: string): boolean {
  return (SUPPORTED_AUDIO_EXTENSIONS as readonly string[]).includes(ext.toLowerCase())
}

export function isKnownUnsupportedAudioExtension(ext: string): boolean {
  return (UNSUPPORTED_AUDIO_EXTENSIONS as readonly string[]).includes(ext.toLowerCase())
}

export function extensionOf(filePath: string): string {
  const name = filePath.slice(Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot).toLowerCase()
}

export function baseName(filePath: string): string {
  const name = filePath.slice(Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1)
  return name.replace(/\.[^.]+$/, '')
}

export function displayArtist(track: Pick<Track, 'artist' | 'albumArtist'>): string {
  return track.artist || track.albumArtist || UNKNOWN_ARTIST
}

export function displayAlbum(track: Pick<Track, 'album'>): string {
  return track.album || UNKNOWN_ALBUM
}
