import type { DiscoveryResult } from '@core/discovery'
import { escapeLucene, fetchJson, truncate } from './http'

/**
 * Clients for the public, key-free catalogues: Open Library, Project Gutenberg,
 * LibriVox and the Internet Archive. Each returns normalised DiscoveryResults
 * that point at the catalogue page and, where a legitimate direct link exists,
 * at the readable/listenable file.
 */

interface OpenLibraryDoc {
  key?: string
  title?: string
  author_name?: string[]
  first_publish_year?: number
  ebook_access?: string
  public_scan_b?: boolean
  ia?: string[]
  subtitle?: string
}

interface OpenLibraryResponse {
  docs?: OpenLibraryDoc[]
}

export async function searchOpenLibrary(query: string, limit: number, signal?: AbortSignal): Promise<DiscoveryResult[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    fields: 'key,title,author_name,first_publish_year,ebook_access,public_scan_b,subtitle,ia'
  })
  const data = await fetchJson<OpenLibraryResponse>(`https://openlibrary.org/search.json?${params.toString()}`, { signal })
  return (data.docs ?? []).flatMap((doc) => {
    if (!doc.key || !doc.title) return []
    const editionId = doc.ia?.[0]
    const isPublic = doc.ebook_access === 'public' || doc.public_scan_b === true
    const detailUrl = `https://openlibrary.org${doc.key}`
    return [
      {
        id: doc.key,
        source: 'openlibrary' as const,
        kind: 'book' as const,
        title: doc.title,
        creator: doc.author_name?.slice(0, 2).join(', ') ?? null,
        year: typeof doc.first_publish_year === 'number' ? doc.first_publish_year : null,
        description: truncate(doc.subtitle),
        detailUrl,
        accessUrl: isPublic && editionId ? `https://archive.org/details/${encodeURIComponent(editionId)}` : detailUrl,
        accessKind: isPublic ? ('read-online' as const) : ('borrow' as const),
        accessLabel: isPublic ? 'Read online' : 'Borrow or preview',
        rights: isPublic ? 'Public domain / openly readable' : 'In copyright — borrow through Open Library'
      }
    ]
  })
}

interface GutendexAuthor {
  name?: string
}

interface GutendexBook {
  id?: number
  title?: string
  authors?: GutendexAuthor[]
  formats?: Record<string, string>
  download_count?: number
}

interface GutendexResponse {
  results?: GutendexBook[]
}

export async function searchGutenberg(query: string, limit: number, signal?: AbortSignal): Promise<DiscoveryResult[]> {
  const params = new URLSearchParams({ search: query })
  let data: GutendexResponse
  try {
    data = await fetchJson<GutendexResponse>(`https://gutendex.com/books?${params.toString()}`, { signal, timeoutMs: 5500 })
  } catch {
    // Gutendex is a community mirror that is unreachable from some networks.
    // The Internet Archive hosts the same public-domain texts, so fall back to
    // its `gutenberg` collection instead of losing the source entirely.
    return searchArchive(query, {
      mediatype: 'texts',
      kind: 'book',
      accessLabel: 'Read on archive.org',
      rights: 'Public domain (Project Gutenberg mirror)',
      clause: 'collection:(gutenberg)',
      limit,
      signal
    })
  }
  return (data.results ?? []).slice(0, limit).flatMap((book) => {
    if (typeof book.id !== 'number' || !book.title) return []
    const formats = book.formats ?? {}
    const readUrl =
      formats['text/html'] ??
      formats['application/epub+zip'] ??
      formats['text/plain; charset=utf-8'] ??
      `https://www.gutenberg.org/ebooks/${book.id}`
    const isEpub = Boolean(formats['application/epub+zip']) && readUrl === formats['application/epub+zip']
    return [
      {
        id: String(book.id),
        source: 'gutenberg' as const,
        kind: 'book' as const,
        title: book.title,
        creator: book.authors?.map((author) => author.name).filter(Boolean).slice(0, 2).join(', ') ?? null,
        year: null,
        description: book.download_count ? `${book.download_count.toLocaleString()} downloads on Project Gutenberg` : null,
        detailUrl: `https://www.gutenberg.org/ebooks/${book.id}`,
        accessUrl: readUrl,
        accessKind: isEpub ? ('download' as const) : ('read-online' as const),
        accessLabel: isEpub ? 'Download EPUB' : 'Read online',
        rights: 'Public domain in the United States'
      }
    ]
  })
}

interface ArchiveDoc {
  identifier?: string
  title?: string
  creator?: string | string[]
  year?: string | number
  description?: string | string[]
  mediatype?: string
  collection?: string | string[]
}

interface ArchiveSearchResponse {
  response?: { docs?: ArchiveDoc[] }
}

async function searchArchive(
  query: string,
  options: {
    mediatype: string
    kind: DiscoveryResult['kind']
    accessLabel: string
    rights: string
    limit: number
    /** Extra Lucene clause, e.g. a collection filter. */
    clause?: string
    signal?: AbortSignal
  }
): Promise<DiscoveryResult[]> {
  const params = new URLSearchParams({
    q: [escapeLucene(query), options.clause, `mediatype:(${options.mediatype})`].filter(Boolean).join(' AND '),
    fl: 'identifier,title,creator,year,description,mediatype,collection',
    rows: String(options.limit),
    page: '1',
    output: 'json'
  })
  const data = await fetchJson<ArchiveSearchResponse>(`https://archive.org/advancedsearch.php?${params.toString()}`, {
    signal: options.signal
  })
  return (data.response?.docs ?? []).flatMap((doc) => {
    if (!doc.identifier || !doc.title) return []
    const creator = Array.isArray(doc.creator) ? doc.creator[0] : doc.creator
    const description = Array.isArray(doc.description) ? doc.description[0] : doc.description
    const yearNumber = typeof doc.year === 'number' ? doc.year : Number.parseInt(String(doc.year ?? ''), 10)
    const detailUrl = `https://archive.org/details/${encodeURIComponent(doc.identifier)}`
    return [
      {
        id: doc.identifier,
        source: 'archive' as const,
        kind: options.kind,
        title: doc.title,
        creator: creator ?? null,
        year: Number.isFinite(yearNumber) ? yearNumber : null,
        description: truncate(description),
        detailUrl,
        accessUrl: detailUrl,
        accessKind: 'external' as const,
        accessLabel: options.accessLabel,
        rights: options.rights
      }
    ]
  })
}

export function searchArchiveAudio(query: string, limit: number, signal?: AbortSignal): Promise<DiscoveryResult[]> {
  return searchArchive(query, {
    mediatype: 'audio',
    kind: 'music',
    accessLabel: 'Listen on archive.org',
    rights: 'Check the item’s rights statement',
    limit,
    signal
  })
}

export function searchArchiveVideo(query: string, limit: number, signal?: AbortSignal): Promise<DiscoveryResult[]> {
  return searchArchive(query, {
    mediatype: 'movies',
    kind: 'video',
    accessLabel: 'Watch on archive.org',
    rights: 'Check the item’s rights statement',
    limit,
    signal
  })
}

export function searchLibrivox(query: string, limit: number, signal?: AbortSignal): Promise<DiscoveryResult[]> {
  return searchArchive(query, {
    mediatype: 'audio',
    kind: 'audiobook',
    accessLabel: 'Listen on LibriVox',
    rights: 'Public domain recording',
    clause: 'collection:(librivoxaudio)',
    limit,
    signal
  })
}
