import {
  archiveIdentifierIsValid,
  parseArchiveItem,
  parseArchiveSearchDocs,
  rankArchiveSearchDocs,
  type ArchiveItemRecord,
  type ArchiveSearchDoc
} from '@core/archive'
import { escapeLucene, fetchJson, HttpError } from './http'

/**
 * Internet Archive search and item lookup.
 *
 * Both endpoints are public, key-free read APIs. Search is deliberately limited
 * to title matches: the archive's default full-text index includes OCR and
 * caption transcripts, so `barney` otherwise returns yesterday's news bulletins
 * that merely mentioned the word.
 *
 * Nothing is downloaded or cached here. Episode files are streamed by the
 * player through `bunny-stream:` and only when the user presses play.
 */

export type ArchiveCollection = 'cartoons' | 'classic-tv' | 'movies' | 'radio' | 'all'

interface CollectionFilter {
  collection: string | null
  mediatype: 'movies' | 'audio'
  /** Extra exclusions applied to keep general searches about entertainment. */
  exclude?: string
}

const COLLECTIONS: Record<ArchiveCollection, CollectionFilter> = {
  cartoons: { collection: 'animationandcartoons', mediatype: 'movies' },
  'classic-tv': { collection: 'classic_tv', mediatype: 'movies' },
  movies: { collection: 'moviesandfilms', mediatype: 'movies' },
  radio: { collection: 'oldtimeradio', mediatype: 'audio' },
  // The default: one shelf across the archive's film and TV collections. The
  // narrower collections miss ordinary uploads — "blue's clues" lives outside
  // `animationandcartoons` — and news bulletins are excluded because their
  // transcripts match everything.
  all: { collection: null, mediatype: 'movies', exclude: 'tvnews' }
}

export function archiveCollectionFilter(value: unknown): CollectionFilter {
  const key = typeof value === 'string' && value in COLLECTIONS ? (value as ArchiveCollection) : 'all'
  return COLLECTIONS[key]
}

export interface ArchiveSearchOptions {
  collection?: ArchiveCollection | string | null
  limit?: number
  signal?: AbortSignal
}

export async function searchArchiveItems(
  query: string,
  options: ArchiveSearchOptions = {}
): Promise<ArchiveSearchDoc[]> {
  const filter = archiveCollectionFilter(options.collection)
  const trimmed = String(query ?? '').trim().slice(0, 120)
  const clauses: string[] = []
  if (trimmed.length > 0) clauses.push(`title:(${escapeLucene(trimmed)})`)
  if (filter.collection) clauses.push(`collection:(${filter.collection})`)
  clauses.push(`mediatype:(${filter.mediatype})`)
  if (filter.exclude) clauses.push(`-collection:(${filter.exclude})`)

  const params = new URLSearchParams()
  params.set('q', clauses.join(' AND '))
  for (const field of ['identifier', 'title', 'creator', 'year', 'date', 'description', 'collection', 'mediatype', 'downloads']) {
    params.append('fl[]', field)
  }
  params.set('rows', String(Math.min(Math.max(options.limit ?? 36, 1), 50)))
  params.set('page', '1')
  params.set('output', 'json')
  // An empty query means "browse this shelf", so show what people actually use.
  if (trimmed.length === 0) params.append('sort[]', 'downloads desc')

  try {
    const data = await fetchJson<{ response?: { docs?: unknown } }>(
      `https://archive.org/advancedsearch.php?${params.toString()}`,
      { timeoutMs: 15_000, signal: options.signal }
    )
    return rankArchiveSearchDocs(parseArchiveSearchDocs(data.response?.docs), trimmed)
  } catch (error) {
    if (error instanceof HttpError) {
      throw new Error(`The Internet Archive search failed (HTTP ${error.status}). Try again in a moment.`)
    }
    throw new Error(`The Internet Archive search failed: ${describe(error)}`)
  }
}

export async function fetchArchiveItem(identifier: string, signal?: AbortSignal): Promise<ArchiveItemRecord> {
  if (!archiveIdentifierIsValid(identifier)) throw new Error('That is not a valid archive.org identifier.')
  let raw: unknown
  try {
    raw = await fetchJson<unknown>(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, {
      timeoutMs: 25_000,
      signal
    })
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      throw new Error('That item is no longer on archive.org.')
    }
    throw new Error(`Could not read the item from archive.org: ${describe(error)}`)
  }
  const item = parseArchiveItem(identifier, raw)
  if (!item) {
    throw new Error('This item has no playable audio or video — it may be unavailable, or only contain documents.')
  }
  return item
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
