import { UNKNOWN_ALBUM, UNKNOWN_ARTIST, displayAlbum, displayArtist, type Track } from './models'

/** Pure library search and grouping helpers. */

export function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export interface SearchResult {
  track: Track
  score: number
}

/**
 * Weighted multi-field search. Every query token must match at least one field,
 * so "miles kind" finds "Kind of Blue" by Miles Davis.
 */
export function searchTracks(tracks: readonly Track[], query: string, limit = 500): SearchResult[] {
  const tokens = normalizeText(query).split(' ').filter(Boolean)
  if (tokens.length === 0) return tracks.slice(0, limit).map((track) => ({ track, score: 0 }))

  const results: SearchResult[] = []
  for (const track of tracks) {
    const title = normalizeText(track.title)
    const artist = normalizeText(track.artist)
    const albumArtist = normalizeText(track.albumArtist)
    const album = normalizeText(track.album)
    const genre = normalizeText(track.genre ?? '')

    let total = 0
    let matchedAll = true
    for (const token of tokens) {
      let tokenScore = 0
      if (title.startsWith(token)) tokenScore = 100
      else if (title.includes(token)) tokenScore = 70
      else if (artist.startsWith(token) || albumArtist.startsWith(token)) tokenScore = 60
      else if (artist.includes(token) || albumArtist.includes(token)) tokenScore = 45
      else if (album.startsWith(token)) tokenScore = 40
      else if (album.includes(token)) tokenScore = 30
      else if (genre.includes(token)) tokenScore = 12
      if (tokenScore === 0) {
        matchedAll = false
        break
      }
      total += tokenScore
    }

    if (matchedAll) results.push({ track, score: total })
  }

  results.sort((a, b) => b.score - a.score || a.track.title.localeCompare(b.track.title))
  return results.slice(0, limit)
}

export interface AlbumGroup {
  key: string
  title: string
  artist: string
  year: number | null
  artworkId: string | null
  trackIds: string[]
  trackCount: number
  durationMs: number
}

export function albumKey(track: Pick<Track, 'album' | 'albumArtist' | 'artist'>): string {
  return `${(track.album || UNKNOWN_ALBUM).toLowerCase()}\u0000${(track.albumArtist || track.artist || UNKNOWN_ARTIST).toLowerCase()}`
}

export function groupAlbums(tracks: readonly Track[]): AlbumGroup[] {
  const groups = new Map<string, AlbumGroup>()
  for (const track of tracks) {
    const key = albumKey(track)
    const existing = groups.get(key)
    if (existing) {
      existing.trackIds.push(track.id)
      existing.trackCount += 1
      existing.durationMs += track.durationMs
      if (!existing.artworkId && track.artworkId) existing.artworkId = track.artworkId
      if (existing.year == null && track.year != null) existing.year = track.year
      continue
    }
    groups.set(key, {
      key,
      title: displayAlbum(track),
      artist: track.albumArtist || displayArtist(track),
      year: track.year,
      artworkId: track.artworkId,
      trackIds: [track.id],
      trackCount: 1,
      durationMs: track.durationMs
    })
  }
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title))
}

export interface ArtistGroup {
  name: string
  trackCount: number
  albumCount: number
  artworkId: string | null
  trackIds: string[]
}

export function groupArtists(tracks: readonly Track[]): ArtistGroup[] {
  const groups = new Map<string, ArtistGroup & { albums: Set<string> }>()
  for (const track of tracks) {
    const name = displayArtist(track)
    let group = groups.get(name)
    if (!group) {
      group = { name, trackCount: 0, albumCount: 0, artworkId: null, trackIds: [], albums: new Set() }
      groups.set(name, group)
    }
    group.trackCount += 1
    group.trackIds.push(track.id)
    group.albums.add(albumKey(track))
    if (!group.artworkId && track.artworkId) group.artworkId = track.artworkId
  }
  return [...groups.values()]
    .map(({ albums, ...group }) => ({ ...group, albumCount: albums.size }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Sort tracks in album order (disc, then track number, then title). */
export function sortAlbumTracks(tracks: readonly Track[]): Track[] {
  return [...tracks].sort((a, b) => {
    const disc = (a.discNo ?? 0) - (b.discNo ?? 0)
    if (disc !== 0) return disc
    const number = (a.trackNo ?? Number.MAX_SAFE_INTEGER) - (b.trackNo ?? Number.MAX_SAFE_INTEGER)
    if (number !== 0) return number
    return a.title.localeCompare(b.title)
  })
}
