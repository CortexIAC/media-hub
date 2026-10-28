/**
 * Online catalogue discovery: shared types and pure helpers.
 *
 * Everything here is network-free so the renderer, the main process and the
 * tests can agree on one shape. Only public, documented APIs are used, and a
 * result always says where it can legally be opened.
 */

export type DiscoverySource = 'openlibrary' | 'gutenberg' | 'librivox' | 'archive' | 'youtube'

export type DiscoveryKind = 'book' | 'audiobook' | 'music' | 'video'

export type AccessKind = 'read-online' | 'download' | 'listen' | 'watch' | 'borrow' | 'external'

export interface DiscoveryResult {
  id: string
  source: DiscoverySource
  kind: DiscoveryKind
  title: string
  creator: string | null
  year: number | null
  description: string | null
  /** Where the item lives (catalogue page or official player). */
  detailUrl: string
  /** Direct reading/listening link, when the source offers one. */
  accessUrl: string | null
  accessKind: AccessKind
  accessLabel: string
  /** Plain-language rights note, e.g. "Public domain" or "Borrow required". */
  rights: string
}

export interface DiscoverySourceError {
  source: DiscoverySource
  message: string
}

export interface DiscoveryResponse {
  query: string
  results: DiscoveryResult[]
  errors: DiscoverySourceError[]
  /** Sources that ran, whether or not they returned results. */
  searched: DiscoverySource[]
}

export interface DiscoverySourceInfo {
  id: DiscoverySource
  name: string
  kinds: DiscoveryKind[]
  description: string
  siteUrl: string
  requiresKey: 'youtube' | null
}

export const DISCOVERY_SOURCES: readonly DiscoverySourceInfo[] = [
  {
    id: 'openlibrary',
    name: 'Open Library',
    kinds: ['book'],
    description: 'Internet Archive’s book catalogue. Public-domain titles read instantly; in-copyright titles can be borrowed with a free account.',
    siteUrl: 'https://openlibrary.org',
    requiresKey: null
  },
  {
    id: 'gutenberg',
    name: 'Project Gutenberg',
    kinds: ['book'],
    description: 'Over 75,000 public-domain ebooks, free to read or download in EPUB, HTML and Kindle formats.',
    siteUrl: 'https://www.gutenberg.org',
    requiresKey: null
  },
  {
    id: 'librivox',
    name: 'LibriVox',
    kinds: ['audiobook'],
    description: 'Volunteer-read audiobooks of public-domain books, hosted by the Internet Archive.',
    siteUrl: 'https://librivox.org',
    requiresKey: null
  },
  {
    id: 'archive',
    name: 'Internet Archive',
    kinds: ['music', 'video'],
    description: 'Live concerts, 78 rpm records, public-domain films and ephemeral video. Rights vary per item.',
    siteUrl: 'https://archive.org',
    requiresKey: null
  },
  {
    id: 'youtube',
    name: 'YouTube',
    kinds: ['music', 'video'],
    description: 'Search-only with your own Data API key. Results open in the browser; audio extraction is not permitted by YouTube’s terms.',
    siteUrl: 'https://developers.google.com/youtube/v3',
    requiresKey: 'youtube'
  }
]

/** Trim, collapse whitespace and bound the length of a catalogue query. */
export function normalizeDiscoveryQuery(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 120)
}

/**
 * Removes duplicates (same source + id) while keeping the first occurrence, so
 * a result recommended by two sources is only listed once per source.
 */
export function dedupeDiscoveryResults(results: readonly DiscoveryResult[]): DiscoveryResult[] {
  const seen = new Set<string>()
  const output: DiscoveryResult[] = []
  for (const result of results) {
    const key = `${result.source}:${result.id}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push(result)
  }
  return output
}

export function filterDiscoveryKinds(
  results: readonly DiscoveryResult[],
  kinds: readonly DiscoveryKind[] | undefined
): DiscoveryResult[] {
  if (!kinds || kinds.length === 0) return [...results]
  const allowed = new Set(kinds)
  return results.filter((result) => allowed.has(result.kind))
}

export function discoveryGlyph(kind: DiscoveryKind): string {
  switch (kind) {
    case 'book':
      return 'Book'
    case 'audiobook':
      return 'Audio'
    case 'music':
      return 'Music'
    case 'video':
      return 'Video'
    default:
      return 'Item'
  }
}

export function sourceLabel(source: DiscoverySource): string {
  return DISCOVERY_SOURCES.find((entry) => entry.id === source)?.name ?? source
}
