import { describe, expect, it } from 'vitest'
import type { Track } from '@core/models'
import {
  albumKey,
  groupAlbums,
  groupArtists,
  normalizeText,
  searchTracks,
  sortAlbumTracks
} from '@core/search'

function makeTrack(overrides: Partial<Track> & { id: string }): Track {
  const { id, ...rest } = overrides
  return {
    id,
    path: `C:/music/${id}.mp3`,
    folderId: 'folder',
    title: 'Untitled',
    artist: '',
    albumArtist: '',
    album: '',
    trackNo: null,
    discNo: null,
    year: null,
    genre: null,
    durationMs: 1000,
    codec: 'MPEG 1 Layer 3',
    container: 'MPEG',
    bitrate: 320000,
    sampleRate: 44100,
    channels: 2,
    lossless: false,
    artworkId: null,
    lyrics: null,
    lyricsSource: null,
    fileSize: 100,
    mtimeMs: 0,
    addedAt: 0,
    updatedAt: 0,
    issues: [],
    ...rest
  }
}

const tracks: Track[] = [
  makeTrack({ id: '1', title: 'So What', artist: 'Miles Davis', album: 'Kind of Blue', albumArtist: 'Miles Davis', genre: 'Jazz', trackNo: 1, year: 1959, durationMs: 545000 }),
  makeTrack({ id: '2', title: 'Blue in Green', artist: 'Miles Davis', album: 'Kind of Blue', albumArtist: 'Miles Davis', genre: 'Jazz', trackNo: 3, year: 1959, durationMs: 337000 }),
  makeTrack({ id: '3', title: 'Café Solaire', artist: 'Éliane Radigue', album: 'Adnos', genre: 'Drone', durationMs: 600000 }),
  makeTrack({ id: '4', title: 'Kind of Blue (Reprise)', artist: 'Someone Else', album: 'Tribute', genre: 'Jazz', durationMs: 120000 }),
  makeTrack({ id: '5', title: 'Untitled', artist: 'Unknown Artist' })
]

describe('normalizeText', () => {
  it('strips accents, case and punctuation', () => {
    expect(normalizeText('Café Solaire!')).toBe('cafe solaire')
    expect(normalizeText('  ÉLIANE  ')).toBe('eliane')
  })
})

describe('searchTracks', () => {
  it('finds tracks by title, artist, album and genre', () => {
    expect(searchTracks(tracks, 'so what').map((hit) => hit.track.id)).toEqual(['1'])
    expect(searchTracks(tracks, 'miles').map((hit) => hit.track.id).sort()).toEqual(['1', '2'])
    expect(searchTracks(tracks, 'adnos').map((hit) => hit.track.id)).toEqual(['3'])
    expect(searchTracks(tracks, 'jazz').map((hit) => hit.track.id).length).toBe(3)
  })

  it('matches across fields with multiple tokens', () => {
    expect(searchTracks(tracks, 'miles kind').map((hit) => hit.track.id).sort()).toEqual(['1', '2'])
    expect(searchTracks(tracks, 'miles nothing')).toEqual([])
  })

  it('prefers title matches over album matches', () => {
    const hits = searchTracks(tracks, 'kind')
    expect(hits[0]?.track.id).toBe('4')
  })

  it('is accent insensitive', () => {
    expect(searchTracks(tracks, 'cafe').map((hit) => hit.track.id)).toEqual(['3'])
    expect(searchTracks(tracks, 'eliane').map((hit) => hit.track.id)).toEqual(['3'])
  })

  it('handles empty queries and limits', () => {
    expect(searchTracks(tracks, '   ')).toHaveLength(tracks.length)
    expect(searchTracks(tracks, 'miles', 1)).toHaveLength(1)
    expect(searchTracks([], 'anything')).toEqual([])
  })
})

describe('grouping', () => {
  it('builds album groups with totals and artwork', () => {
    const withArt = tracks.map((track) =>
      track.id === '2' ? { ...track, artworkId: 'cover.jpg' } : track
    )
    const albums = groupAlbums(withArt)
    const blue = albums.find((album) => album.title === 'Kind of Blue')
    expect(blue).toBeDefined()
    expect(blue?.trackIds).toEqual(['1', '2'])
    expect(blue?.durationMs).toBe(882000)
    expect(blue?.artworkId).toBe('cover.jpg')
    expect(blue?.year).toBe(1959)
    expect(blue?.artist).toBe('Miles Davis')
  })

  it('separates same-titled albums by album artist', () => {
    const a = makeTrack({ id: 'a', title: 'X', album: 'Greatest Hits', albumArtist: 'One' })
    const b = makeTrack({ id: 'b', title: 'Y', album: 'Greatest Hits', albumArtist: 'Two' })
    expect(albumKey(a)).not.toBe(albumKey(b))
    expect(groupAlbums([a, b])).toHaveLength(2)
  })

  it('groups unknown albums and artists consistently', () => {
    const albums = groupAlbums([makeTrack({ id: 'u', title: 'Loose Track' })])
    expect(albums[0]?.title).toBe('Unknown Album')
    expect(albums[0]?.artist).toBe('Unknown Artist')
  })

  it('counts artist tracks and distinct albums', () => {
    const artists = groupArtists(tracks)
    const miles = artists.find((artist) => artist.name === 'Miles Davis')
    expect(miles?.trackCount).toBe(2)
    expect(miles?.albumCount).toBe(1)
    expect(artists.some((artist) => artist.name === 'Unknown Artist')).toBe(true)
  })

  it('sorts album tracks by disc, then track number, then title', () => {
    const sorted = sortAlbumTracks([
      makeTrack({ id: 'c', title: 'Three', trackNo: 3, discNo: 1 }),
      makeTrack({ id: 'b', title: 'Two', trackNo: 2, discNo: 2 }),
      makeTrack({ id: 'a', title: 'One', trackNo: 1, discNo: 1 }),
      makeTrack({ id: 'd', title: 'No Number', discNo: 1 })
    ])
    expect(sorted.map((track) => track.id)).toEqual(['a', 'c', 'd', 'b'])
  })
})
