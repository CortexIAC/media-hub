import { useState, type ReactElement } from 'react'
import {
  DISCOVERY_SOURCES,
  filterDiscoveryKinds,
  sourceLabel,
  type DiscoveryKind
} from '@core/discovery'
import { DiscoveryRow } from '../components/DiscoveryRow'
import { EmptyState } from '../components/EmptyState'
import { BookIcon, SearchIcon } from '../components/Icons'
import { useDiscovery } from '../state/discovery'

const KIND_FILTERS: Array<{ label: string; kinds: DiscoveryKind[] }> = [
  { label: 'Everything', kinds: [] },
  { label: 'Books', kinds: ['book'] },
  { label: 'Audiobooks', kinds: ['audiobook'] },
  { label: 'Music', kinds: ['music'] },
  { label: 'Video', kinds: ['video'] }
]

/**
 * The virtual library: one search across the public catalogues. Results always
 * say what access is actually available — public domain, borrow-only, or a link
 * to the rights holder's own player.
 */
export function VirtualLibraryView(): ReactElement {
  const [query, setQuery] = useState('')
  const [kinds, setKinds] = useState<DiscoveryKind[]>([])
  const discovery = useDiscovery(query, kinds)
  const results = filterDiscoveryKinds(discovery.data?.results ?? [], kinds)
  const searched = discovery.data?.searched ?? []
  const errors = discovery.data?.errors ?? []

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-header-text">
          <span className="view-eyebrow">Books · audiobooks · archive</span>
          <h1>Virtual Library</h1>
          <p className="view-subtitle">
            Search public catalogues without leaving the app. Public-domain works open in full; in-copyright titles link to
            borrowing or to the rights holder’s own player.
          </p>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 14, gap: 10 }}>
        <div className="search-field" style={{ flex: 1 }}>
          <SearchIcon size={15} />
          <input
            id="library-search"
            className="input"
            type="search"
            placeholder="Search books, audiobooks, concerts, films…"
            value={query}
            aria-label="Search online catalogues"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="discovery-filters" role="group" aria-label="Filter catalogues">
        {KIND_FILTERS.map((filter) => {
          const active = filter.kinds.join(',') === kinds.join(',')
          return (
            <button
              type="button"
              key={filter.label}
              className={`btn btn-sm ${active ? 'btn-primary' : 'btn-ghost'}`}
              aria-pressed={active}
              onClick={() => setKinds(filter.kinds)}
            >
              {filter.label}
            </button>
          )
        })}
      </div>

      {query.trim().length < 2 ? (
        <>
          <section className="section">
            <div className="section-header">
              <h2>Sources</h2>
            </div>
            <div className="catalogue-grid">
              {DISCOVERY_SOURCES.map((source) => (
                <button
                  type="button"
                  key={source.id}
                  className="catalogue-card"
                  onClick={() => void window.bunny.app.openExternal(source.siteUrl)}
                >
                  <strong>
                    {source.name}
                    {source.requiresKey ? ' · key required' : ''}
                  </strong>
                  <span>{source.description}</span>
                </button>
              ))}
            </div>
          </section>

          <EmptyState
            icon={<BookIcon size={24} />}
            title="Search every shelf at once"
            message="Try a title, author or subject — for example “Haddix”, “sherlock holmes” or “jazz quartet”. Only public-domain works can be read in full here; copyrighted books link to legal borrowing."
          />
        </>
      ) : discovery.status === 'loading' && discovery.data === null ? (
        <p className="faint">Searching {searched.length > 0 ? 'catalogues' : 'the catalogue APIs'}…</p>
      ) : discovery.status === 'error' ? (
        <EmptyState icon={<SearchIcon size={24} />} title="The catalogue search failed" message={discovery.error ?? 'Unknown error.'}>
          <button type="button" className="btn" onClick={() => setQuery((value) => `${value} `.trim())}>
            Retry
          </button>
        </EmptyState>
      ) : results.length === 0 ? (
        <EmptyState
          icon={<SearchIcon size={24} />}
          title="No catalogue results"
          message={`Nothing matched “${query.trim()}” in the selected sources. Try a shorter query, or a different filter.`}
        />
      ) : (
        <>
          <div className="section-header">
            <h2>
              {results.length.toLocaleString()} result{results.length === 1 ? '' : 's'}
            </h2>
            <span className="faint" style={{ fontSize: 11.5 }}>
              {searched.map((source) => sourceLabel(source)).join(' · ')}
            </span>
          </div>
          <div className="discovery-list">
            {results.map((result) => (
              <DiscoveryRow key={`${result.source}:${result.id}`} result={result} />
            ))}
          </div>
        </>
      )}

      {errors.length > 0 ? (
        <p className="faint" style={{ fontSize: 11.5, marginTop: 14 }}>
          Unavailable right now: {errors.map((error) => `${sourceLabel(error.source)} (${error.message})`).join('; ')}.
        </p>
      ) : null}

      <p className="faint" style={{ fontSize: 11.5, marginTop: 18, lineHeight: 1.6, maxWidth: 760 }}>
        Results open in your browser. Bunny Media Hub does not download copyrighted books or strip audio from any service; every
        source here is a public API that publishes its own access rules.
      </p>
    </div>
  )
}
