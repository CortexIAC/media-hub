import { describe, expect, it } from 'vitest'
import {
  DISCOVERY_SOURCES,
  dedupeDiscoveryResults,
  discoveryGlyph,
  filterDiscoveryKinds,
  normalizeDiscoveryQuery,
  sourceLabel,
  type DiscoveryResult
} from '@core/discovery'

function result(overrides: Partial<DiscoveryResult> = {}): DiscoveryResult {
  return {
    id: 'item-1',
    source: 'openlibrary',
    kind: 'book',
    title: 'A Book',
    creator: null,
    year: null,
    description: null,
    detailUrl: 'https://example.test/item',
    accessUrl: null,
    accessKind: 'read-online',
    accessLabel: 'Read online',
    rights: 'Public domain',
    ...overrides
  }
}

describe('normalizeDiscoveryQuery', () => {
  it('collapses whitespace and trims', () => {
    expect(normalizeDiscoveryQuery('  margaret   peterson \n haddix ')).toBe('margaret peterson haddix')
  })

  it('bounds the query length', () => {
    expect(normalizeDiscoveryQuery('x'.repeat(500))).toHaveLength(120)
  })

  it('keeps short queries short', () => {
    expect(normalizeDiscoveryQuery('ab')).toBe('ab')
    expect(normalizeDiscoveryQuery('   ')).toBe('')
  })
})

describe('dedupeDiscoveryResults', () => {
  it('keeps one row per source and id', () => {
    const first = result({ id: 'same' })
    const duplicate = result({ id: 'same', title: 'Duplicate' })
    const otherSource = result({ id: 'same', source: 'gutenberg' })
    const deduped = dedupeDiscoveryResults([first, duplicate, otherSource])
    expect(deduped).toHaveLength(2)
    expect(deduped[0]?.title).toBe('A Book')
    expect(deduped[1]?.source).toBe('gutenberg')
  })

  it('preserves input order', () => {
    const deduped = dedupeDiscoveryResults([
      result({ id: 'b', source: 'gutenberg' }),
      result({ id: 'a', source: 'openlibrary' })
    ])
    expect(deduped.map((entry) => entry.id)).toEqual(['b', 'a'])
  })
})

describe('filterDiscoveryKinds', () => {
  it('returns everything when no filter is set', () => {
    const results = [result(), result({ id: '2', kind: 'video' })]
    expect(filterDiscoveryKinds(results, undefined)).toHaveLength(2)
    expect(filterDiscoveryKinds(results, [])).toHaveLength(2)
  })

  it('keeps only the requested kinds', () => {
    const results = [result(), result({ id: '2', kind: 'video' }), result({ id: '3', kind: 'audiobook' })]
    expect(filterDiscoveryKinds(results, ['video']).map((entry) => entry.id)).toEqual(['2'])
    expect(filterDiscoveryKinds(results, ['book', 'audiobook']).map((entry) => entry.id)).toEqual(['item-1', '3'])
  })
})

describe('catalogue metadata', () => {
  it('labels every source', () => {
    for (const source of DISCOVERY_SOURCES) {
      expect(sourceLabel(source.id)).toBe(source.name)
    }
  })

  it('marks YouTube as the only keyed source', () => {
    expect(DISCOVERY_SOURCES.filter((source) => source.requiresKey).map((source) => source.id)).toEqual(['youtube'])
  })

  it('gives every kind a short glyph', () => {
    expect(discoveryGlyph('book')).toBe('Book')
    expect(discoveryGlyph('audiobook')).toBe('Audio')
  })
})
