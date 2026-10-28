import { describe, expect, it } from 'vitest'
import { decodeHtmlEntities, parseYouTubeLength, parseYouTubeSearchPage } from '../../src/core/youtube'

/** A trimmed-down copy of the payload YouTube's web search returns. */
const payload = {
  contents: {
    twoColumnSearchResultsRenderer: {
      primaryContents: {
        sectionListRenderer: {
          contents: [
            {
              itemSectionRenderer: {
                contents: [
                  {
                    videoRenderer: {
                      videoId: '3A0h8vMmYhQ',
                      title: { runs: [{ text: 'Lil Noonie x Lil Sy - Mari Glock (Official Music Video)' }] },
                      ownerText: { runs: [{ text: 'Lil Noonie', navigationEndpoint: {} }] },
                      lengthText: { simpleText: '2:26' },
                      descriptionSnippet: { runs: [{ text: 'Mari Glock ' }, { text: 'official video' }] }
                    }
                  },
                  {
                    videoRenderer: {
                      videoId: 'OerGLFtnGwA',
                      title: { simpleText: 'Mari Glock &amp; friends' },
                      shortBylineText: { runs: [{ text: 'Some Channel' }] },
                      lengthText: { simpleText: '1:02:26' }
                    }
                  },
                  {
                    // Broken item: no id, must be skipped rather than shown.
                    videoRenderer: { title: { runs: [{ text: 'No id here' }] } }
                  },
                  {
                    // Invalid id length.
                    videoRenderer: { videoId: 'short', title: { runs: [{ text: 'Bad id' }] } }
                  }
                ]
              }
            },
            {
              itemSectionRenderer: {
                contents: [
                  {
                    compactVideoRenderer: {
                      videoId: 'hgTGkj46ACg',
                      title: { runs: [{ text: 'Mari Glock (og audio)' }] },
                      longBylineText: { runs: [{ text: 'Justlisten' }] },
                      lengthText: { simpleText: '2:01' }
                    }
                  },
                  {
                    // Duplicate of the first result: deduped by id.
                    videoRenderer: {
                      videoId: '3A0h8vMmYhQ',
                      title: { runs: [{ text: 'Same video again' }] },
                      lengthText: { simpleText: '2:26' }
                    }
                  }
                ]
              }
            }
          ]
        }
      }
    }
  }
}

describe('parseYouTubeSearchPage', () => {
  it('reads real results from a search payload', () => {
    const videos = parseYouTubeSearchPage(payload)
    expect(videos.map((video) => video.id)).toEqual(['3A0h8vMmYhQ', 'OerGLFtnGwA', 'hgTGkj46ACg'])
  })

  it('maps metadata onto the app model', () => {
    const [first, second, third] = parseYouTubeSearchPage(payload)
    expect(first).toMatchObject({
      title: 'Lil Noonie x Lil Sy - Mari Glock (Official Music Video)',
      channel: 'Lil Noonie',
      durationMs: 146_000,
      url: 'https://www.youtube.com/watch?v=3A0h8vMmYhQ',
      thumbnailUrl: 'https://i.ytimg.com/vi/3A0h8vMmYhQ/mqdefault.jpg',
      description: 'Mari Glock official video'
    })
    // simpleText titles, hour-long durations and shortBylineText channels.
    expect(second).toMatchObject({ title: 'Mari Glock & friends', channel: 'Some Channel', durationMs: 3_746_000 })
    // compactVideoRenderer uses longBylineText for the channel.
    expect(third).toMatchObject({ channel: 'Justlisten', durationMs: 121_000 })
  })

  it('never invents results for empty or malformed payloads', () => {
    expect(parseYouTubeSearchPage(null)).toEqual([])
    expect(parseYouTubeSearchPage({})).toEqual([])
    expect(parseYouTubeSearchPage({ videoRenderer: null })).toEqual([])
    expect(parseYouTubeSearchPage({ contents: [{ videoRenderer: { videoId: '3A0h8vMmYhQ' } }] })).toEqual([])
  })

  it('ignores playlist and channel renderers for now', () => {
    const mixed = {
      contents: [
        { playlistRenderer: { playlistId: 'PL123456789', title: { simpleText: 'A playlist' } } },
        { channelRenderer: { channelId: 'UC123456789', title: { simpleText: 'A channel' } } }
      ]
    }
    expect(parseYouTubeSearchPage(mixed)).toEqual([])
  })
})

describe('parseYouTubeLength', () => {
  it('parses minutes, hours and rejects everything else', () => {
    expect(parseYouTubeLength('2:26')).toBe(146_000)
    expect(parseYouTubeLength('1:02:26')).toBe(3_746_000)
    expect(parseYouTubeLength('0:07')).toBe(7_000)
    expect(parseYouTubeLength('LIVE')).toBeNull()
    expect(parseYouTubeLength('1:2')).toBeNull()
    expect(parseYouTubeLength('0:00')).toBeNull()
    expect(parseYouTubeLength(null)).toBeNull()
  })
})

describe('decodeHtmlEntities', () => {
  it('decodes the entities YouTube sends in titles', () => {
    expect(decodeHtmlEntities('Rock &amp; Roll &#39;90s&#39; &#x27;live&#x27;')).toBe("Rock & Roll '90s' 'live'")
    expect(decodeHtmlEntities('no entities')).toBe('no entities')
    expect(decodeHtmlEntities('&unknown; stays')).toBe('&unknown; stays')
  })
})
