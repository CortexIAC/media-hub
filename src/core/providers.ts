/**
 * Provider contracts for external services.
 *
 * These are interfaces plus a factual capability catalogue. Nothing in this
 * module performs network I/O. Sprint 1 deliberately ships no remote provider:
 * the catalogue records what each service actually permits so the UI can show
 * honest "planned / needs authorization / not permitted" states instead of
 * pretending features exist.
 */

export type ProviderId =
  | 'local'
  | 'spotify'
  | 'apple-music'
  | 'youtube'
  | 'internet-archive'
  | 'cinejoy'

export type ProviderKind = 'local' | 'music' | 'video' | 'archive'

export type ProviderStatus =
  | 'available'
  | 'requires-configuration'
  | 'requires-auth'
  | 'requires-subscription'
  | 'planned'
  | 'not-permitted'
  | 'unavailable'

export type CapabilityKey =
  | 'search'
  | 'browse'
  | 'playback'
  | 'embedded-playback'
  | 'background-playback'
  | 'full-track-streaming'
  | 'playlist-import'
  | 'library-sync'
  | 'downloads'
  | 'device-sync'

export interface Capability {
  supported: boolean
  note: string
}

export interface ProviderDescriptor {
  id: ProviderId
  name: string
  kind: ProviderKind
  status: ProviderStatus
  summary: string
  /** Why the status is what it is, in one sentence. */
  statusReason: string
  requirements: string[]
  capabilities: Partial<Record<CapabilityKey, Capability>>
  documentationUrl: string | null
  /** Whether this sprint ships a working integration. */
  integrated: boolean
}

export const PROVIDER_CATALOG: readonly ProviderDescriptor[] = [
  {
    id: 'local',
    name: 'Local Library',
    kind: 'local',
    status: 'available',
    summary: 'Music imported from folders on this machine.',
    statusReason: 'Ships in Sprint 1 with real playback and metadata extraction.',
    requirements: [],
    documentationUrl: null,
    integrated: true,
    capabilities: {
      search: { supported: true, note: 'Indexed locally, no network required.' },
      browse: { supported: true, note: 'Albums, artists, tracks, folders, playlists.' },
      playback: { supported: true, note: 'Chromium audio pipeline via bunny-media://.' },
      'background-playback': { supported: true, note: 'Plays while the window is minimized.' },
      'full-track-streaming': { supported: false, note: 'Local files only.' },
      downloads: { supported: true, note: 'Files already exist on disk.' }
    }
  },
  {
    id: 'youtube',
    name: 'YouTube',
    kind: 'video',
    status: 'requires-configuration',
    summary: 'Video and music search with playback in a visible embedded player.',
    statusReason:
      'Search needs a YouTube Data API v3 key. Playback must stay visible in the official embedded player; audio extraction and background play are prohibited by the YouTube API Developer Policies.',
    requirements: ['YouTube Data API v3 key', 'Visible embedded player (>= 200x200)', 'Network access'],
    documentationUrl: 'https://developers.google.com/youtube/terms/developer-policies-guide',
    integrated: false,
    capabilities: {
      search: { supported: true, note: 'search.list; default daily cap of 100 search calls per project.' },
      browse: { supported: false, note: 'No trending/catalogue browsing without additional quota use.' },
      'embedded-playback': { supported: true, note: 'IFrame Player API; player must remain visible with YouTube controls.' },
      playback: { supported: false, note: 'No sanctioned raw stream URL is issued to API clients.' },
      'background-playback': { supported: false, note: 'Prohibited: no playback when the app is hidden or minimized.' },
      'full-track-streaming': { supported: false, note: 'Audio-only extraction is prohibited.' },
      downloads: { supported: false, note: 'Prohibited outside YouTube Premium offline.' },
      'library-sync': { supported: false, note: 'No third-party access to a user’s YouTube Music library.' },
      'playlist-import': { supported: true, note: 'Public playlists via Data API.' },
      'device-sync': { supported: false, note: 'No cross-device playback control API.' }
    }
  },
  {
    id: 'spotify',
    name: 'Spotify',
    kind: 'music',
    status: 'requires-subscription',
    summary: 'Catalog search and library browsing; playback through the official Web Playback SDK.',
    statusReason:
      'The Web API needs OAuth and the app owner must hold Premium in Development Mode. Full playback requires each listener to have Premium and to use Spotify’s SDK, and Electron is not listed as a supported SDK environment.',
    requirements: ['Spotify Premium (app owner and listener)', 'OAuth client id', 'Spotify developer approval for commercial use'],
    documentationUrl: 'https://developer.spotify.com/documentation/web-playback-sdk',
    integrated: false,
    capabilities: {
      search: { supported: true, note: 'Requires OAuth; Premium required to use the Web API.' },
      browse: { supported: true, note: 'Playlists and saved library for the signed-in user.' },
      playback: { supported: true, note: 'Only via the Web Playback SDK; not verified in Electron.' },
      'background-playback': { supported: false, note: 'Not documented for Electron; treated as unverified.' },
      'full-track-streaming': { supported: false, note: 'No raw audio URLs; playback stays inside the SDK.' },
      'playlist-import': { supported: true, note: 'Read-only playlist import with user consent.' },
      'library-sync': { supported: true, note: 'Read-only saved tracks/albums with consent.' },
      downloads: { supported: false, note: 'Not offered to third-party clients.' },
      'device-sync': { supported: true, note: 'Playback state, seek and device transfer (Premium).' }
    }
  },
  {
    id: 'apple-music',
    name: 'Apple Music',
    kind: 'music',
    status: 'requires-auth',
    summary: 'Catalog search and MusicKit playback for Apple Music subscribers.',
    statusReason:
      'Requires a paid Apple Developer account for a MusicKit developer token and a listener subscription. MusicKit JS is Apple’s supported playback path; Electron is not a documented target.',
    requirements: ['Paid Apple Developer account', 'MusicKit identifier + private key', 'Listener Apple Music subscription'],
    documentationUrl: 'https://developer.apple.com/documentation/applemusicapi/',
    integrated: false,
    capabilities: {
      search: { supported: true, note: 'Catalog search with an Apple developer token.' },
      browse: { supported: true, note: 'Catalog and user library with Music-User-Token.' },
      playback: { supported: true, note: 'Through MusicKit only; Electron support unverified.' },
      'background-playback': { supported: false, note: 'No documented Electron/background guarantee.' },
      'full-track-streaming': { supported: false, note: 'No independent audio URLs; MusicKit owns playback.' },
      'playlist-import': { supported: true, note: 'User playlists with explicit authorization.' },
      'library-sync': { supported: true, note: 'User library read access with authorization.' },
      downloads: { supported: false, note: 'Not available to third-party apps.' },
      'device-sync': { supported: false, note: 'No third-party cross-device control API.' }
    }
  },
  {
    id: 'internet-archive',
    name: 'Internet Archive',
    kind: 'archive',
    status: 'planned',
    summary: 'Public-domain audio, concerts and films streamed from archive.org.',
    statusReason:
      'Feasible with public read APIs and direct item URLs, but not implemented in Sprint 1. Needs per-item rights checks, a descriptive User-Agent, cached metadata and 429 backoff.',
    requirements: ['Descriptive User-Agent', 'Rate-limit friendly client (honour 429/Retry-After)', 'Per-item rights review'],
    documentationUrl: 'https://archive.org/developers/index-apis.html',
    integrated: false,
    capabilities: {
      search: { supported: true, note: 'Advanced Search / scrape endpoints, JSON output.' },
      browse: { supported: true, note: 'Collections and items via mediatype filters.' },
      playback: { supported: true, note: 'Direct /download/ item URLs; CORS/range behaviour must be tested per item.' },
      'embedded-playback': { supported: true, note: 'Official embeddable player available.' },
      'background-playback': { supported: true, note: 'Not governed by a YouTube-style background restriction.' },
      'playlist-import': { supported: false, note: 'No user playlist API; items can be queued directly.' },
      downloads: { supported: true, note: 'Only where the item’s rights allow it.' },
      'device-sync': { supported: false, note: 'Not applicable.' }
    }
  },
  {
    id: 'cinejoy',
    name: 'Cinejoy',
    kind: 'video',
    status: 'not-permitted',
    summary: 'Cinequest’s ticketed virtual cinema.',
    statusReason:
      'No public developer API or embeddable player is documented; viewing requires a Cinejoy/Creatics account and ticket. Not integrable without a partner agreement.',
    requirements: ['Partner agreement with Cinequest/Creatics'],
    documentationUrl: 'https://creatics.org/cinejoy',
    integrated: false,
    capabilities: {
      search: { supported: false, note: 'No public API.' },
      browse: { supported: false, note: 'No public API.' },
      playback: { supported: false, note: 'Ticketed playback only in Cinejoy’s own apps.' },
      'embedded-playback': { supported: false, note: 'No third-party embed documented.' },
      'background-playback': { supported: false, note: 'Not applicable.' },
      downloads: { supported: false, note: 'Not offered.' }
    }
  }
]

export function getProviderDescriptor(id: ProviderId): ProviderDescriptor | undefined {
  return PROVIDER_CATALOG.find((provider) => provider.id === id)
}

/* ------------------------------------------------------------------------ *
 * Contracts a future provider implementation must satisfy.
 * ------------------------------------------------------------------------ */

export interface ProviderAuthState {
  status: 'signed-out' | 'signed-in' | 'expired'
  accountLabel: string | null
}

/** Authentication abstraction; implementations own token storage. */
export interface ProviderAuth {
  getState(): Promise<ProviderAuthState>
  signIn(): Promise<ProviderAuthState>
  signOut(): Promise<void>
  getAccessToken(): Promise<string | null>
}

export interface ProviderSearchOptions {
  kinds?: Array<'track' | 'album' | 'artist' | 'video' | 'playlist'>
  limit?: number
  signal?: AbortSignal
}

export interface ProviderMediaItem {
  providerId: ProviderId
  id: string
  kind: 'track' | 'album' | 'artist' | 'video' | 'playlist'
  title: string
  subtitle: string | null
  artworkUrl: string | null
  durationMs: number | null
}

export type ProviderPlaybackTarget =
  | { kind: 'stream'; url: string; mustBeVisible: false }
  | { kind: 'embed'; url: string; mustBeVisible: true }
  | { kind: 'unsupported'; reason: string }

export interface RemoteProvider {
  readonly descriptor: ProviderDescriptor
  readonly auth: ProviderAuth | null
  search(query: string, options?: ProviderSearchOptions): Promise<ProviderMediaItem[]>
  resolvePlayback(itemId: string): Promise<ProviderPlaybackTarget>
}
