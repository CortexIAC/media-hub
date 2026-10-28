import { useEffect, useMemo, useRef, type FormEvent, type ReactElement } from 'react'
import { formatDuration, formatFileSize, formatRelativeTime } from '@core/format'
import type { ArchiveCollection, ArchiveEpisodeView, ArchiveItemView } from '@shared/ipc'
import { EmptyState } from '../components/EmptyState'
import {
  AlertIcon,
  ArchiveIcon,
  CaptionsIcon,
  ChevronLeftIcon,
  ExternalIcon,
  FilmIcon,
  InfoIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon
} from '../components/Icons'
import { useArchive, type ArchiveTab } from '../state/archive'

const COLLECTIONS: Array<{ value: ArchiveCollection; label: string }> = [
  { value: 'all', label: 'Everything on film' },
  { value: 'cartoons', label: 'Cartoons' },
  { value: 'classic-tv', label: 'Classic TV' },
  { value: 'movies', label: 'Movies' },
  { value: 'radio', label: 'Old-time radio' }
]

const EXAMPLES = [
  'barney',
  'chuck and friends',
  'angelina ballerina',
  'blue’s clues',
  'blue’s room',
  'looney tunes',
  'popeye',
  'betty boop'
] as const

const VISIBLE_EXAMPLES = 5

/**
 * The Internet Archive tab.
 *
 * Discover searches archive.org's public API; Shows and Movies hold what the
 * user saved. Episodes are the item's own media files, deduplicated and labelled
 * from their names, and playback goes through the same in-app player as Streams.
 */
export function ArchiveView(): ReactElement {
  const archive = useArchive()
  const { selected, opening, openError, tab, hits, browse } = archive
  const viewRef = useRef<HTMLDivElement>(null)

  // Load the default shelf the first time the screen is opened, so it is not an
  // empty box waiting for a query.
  useEffect(() => {
    if (tab === 'discover' && hits === null) void browse()
  }, [tab, hits, browse])

  // Opening an item from far down the grid should start at its title, not at the
  // scroll position the previous screen left behind.
  useEffect(() => {
    viewRef.current?.scrollTo({ top: 0 })
  }, [selected?.identifier])

  if (selected) {
    return (
      <div className="view" ref={viewRef}>
        <ArchiveDetail item={selected} opening={opening} error={openError} />
      </div>
    )
  }

  return (
    <div className="view" ref={viewRef}>
      <div className="view-header">
        <div className="view-header-text">
          <span className="view-eyebrow">Internet Archive · public catalogue</span>
          <h1>Archive</h1>
          <p className="view-subtitle">
            Search cartoons, classic television, films and old-time radio, then save what you find to your own Shows and
            Movies library. Episodes stream inside the app from archive.org; nothing is downloaded or re-encoded.
          </p>
        </div>
      </div>

      <div className="archive-tabs" role="tablist" aria-label="Archive sections">
        <TabButton tab="discover" label="Discover" icon={<SearchIcon size={14} />} />
        <TabButton
          tab="shows"
          label="Shows"
          count={archive.library.filter((item) => item.kind === 'show').length}
          icon={<ArchiveIcon size={14} />}
        />
        <TabButton
          tab="movies"
          label="Movies"
          count={archive.library.filter((item) => item.kind === 'movie').length}
          icon={<FilmIcon size={14} />}
        />
      </div>

      {archive.tab === 'discover' ? <Discover /> : <SavedShelf tab={archive.tab} />}
    </div>
  )
}

function TabButton({
  tab,
  label,
  count,
  icon
}: {
  tab: ArchiveTab
  label: string
  count?: number
  icon: ReactElement
}): ReactElement {
  const archive = useArchive()
  const active = archive.tab === tab
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`archive-tab ${active ? 'is-active' : ''}`}
      onClick={() => archive.setTab(tab)}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && count > 0 ? <span className="archive-tab-count">{count}</span> : null}
    </button>
  )
}

function Discover(): ReactElement {
  const archive = useArchive()

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    void archive.runSearch()
  }

  const collectionLabel = COLLECTIONS.find((entry) => entry.value === archive.collection)?.label ?? 'Everything on film'

  return (
    <>
      <form className="card archive-search" onSubmit={submit}>
        <div className="archive-search-row">
          <div className="search-field" style={{ flex: 1 }}>
            <SearchIcon size={15} />
            <input
              id="archive-search"
              className="input"
              type="search"
              placeholder="Search the Internet Archive — a show, cartoon or film title"
              value={archive.query}
              onChange={(event) => archive.setQuery(event.target.value)}
              aria-label="Search the Internet Archive"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={archive.searching}>
            {archive.searching ? 'Searching…' : 'Search'}
          </button>
        </div>

        <div className="archive-chips" role="group" aria-label="Collections">
          {COLLECTIONS.map((entry) => (
            <button
              type="button"
              key={entry.value}
              className={`btn btn-sm ${archive.collection === entry.value ? 'btn-primary' : 'btn-ghost'}`}
              aria-pressed={archive.collection === entry.value}
              onClick={() => archive.setCollection(entry.value)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="archive-try">
          <span>Try</span>
          {EXAMPLES.slice(0, VISIBLE_EXAMPLES).map((example) => (
            <button type="button" key={example} className="btn btn-sm btn-ghost" onClick={() => void archive.searchFor(example)}>
              {example}
            </button>
          ))}
        </div>

        <p className="archive-search-hint">
          Showing <strong>{collectionLabel}</strong>. Titles match on the item name only, ranked so the closest title comes
          first — the archive’s full-text index would otherwise return news bulletins that merely mentioned a word.
        </p>
      </form>

      {archive.broadened ? (
        <div className="card archive-banner is-info" role="status">
          <InfoIcon size={15} />
          <div>
            <strong>Search widened to everything on film</strong>
            <p>
              “{archive.query.trim()}” had fewer than three matches in the collection you had selected, so the whole film
              and TV catalogue was searched instead.
            </p>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={archive.dismissBroadened}>
            Dismiss
          </button>
        </div>
      ) : null}

      {archive.searchError ? (
        <div className="card archive-banner is-error" role="alert">
          <AlertIcon size={15} />
          <div>
            <strong>Search failed</strong>
            <p>{archive.searchError}</p>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => void archive.runSearch()}>
            <RefreshIcon size={12} /> Retry
          </button>
        </div>
      ) : null}

      {archive.hits === null ? (
        <p className="faint archive-status">
          <span className="spinner" /> Loading {collectionLabel.toLowerCase()}…
        </p>
      ) : archive.hits.length === 0 && !archive.searching ? (
        <EmptyState
          icon={<SearchIcon size={24} />}
          title={archive.query.trim().length > 0 ? `Nothing on archive.org for “${archive.query.trim()}”` : 'Nothing on this shelf'}
          message={
            archive.query.trim().length > 0
              ? 'Try a shorter title, or switch collection below. Uploads are named by their uploader, so “blue’s clues” and “blues clues” are different searches.'
              : 'This collection returned no film items. Try another collection.'
          }
        >
          <div className="archive-examples">
            {EXAMPLES.slice(VISIBLE_EXAMPLES).map((example) => (
              <button
                type="button"
                key={example}
                className="btn btn-sm btn-ghost"
                onClick={() => void archive.searchFor(example)}
              >
                {example}
              </button>
            ))}
          </div>
        </EmptyState>
      ) : (
        <>
          <div className="section-header" style={{ marginTop: 18 }}>
            <h2>
              {archive.hits.length} result{archive.hits.length === 1 ? '' : 's'}
              {archive.query.trim().length > 0 ? ` for “${archive.query.trim()}”` : ''}
            </h2>
            <span className="faint" style={{ fontSize: 11.5 }}>
              archive.org · {collectionLabel}
            </span>
          </div>

          <div className="archive-grid">
            {(archive.hits ?? []).map((hit) => (
              <button
                type="button"
                key={hit.identifier}
                className="archive-card"
                onClick={() => void archive.open(hit.identifier)}
                title={hit.title}
              >
                <span className="archive-poster">
                  <span className="archive-poster-letter">{hit.title.slice(0, 1).toUpperCase()}</span>
                  <img
                    src={hit.posterUrl}
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                  />
                  {hit.mediaType === 'audio' ? <span className="archive-poster-tag">Audio</span> : null}
                </span>
                <span className="archive-card-body">
                  <strong className="archive-card-title">{hit.title}</strong>
                  <span className="archive-card-meta">
                    {[hit.year ? String(hit.year) : null, hit.creator, hit.collection?.replace(/_/g, ' ')]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {hit.description ? <span className="archive-card-desc">{hit.description}</span> : null}
                </span>
              </button>
            ))}
          </div>

          <p className="archive-footnote">
            Results come from archive.org. Rights are set by each uploader — the item page states the licence, and the app
            repeats it before you save anything.
          </p>
        </>
      )}
    </>
  )
}

function SavedShelf({ tab }: { tab: ArchiveTab }): ReactElement {
  const archive = useArchive()
  const items = useMemo(
    () => archive.library.filter((item) => (tab === 'shows' ? item.kind === 'show' : item.kind === 'movie')),
    [archive.library, tab]
  )

  if (items.length === 0) {
    return (
      <EmptyState
        icon={tab === 'shows' ? <ArchiveIcon size={24} /> : <FilmIcon size={24} />}
        title={tab === 'shows' ? 'No shows saved yet' : 'No movies saved yet'}
        message={
          tab === 'shows'
            ? 'Find a series in Discover and choose “Save to Shows”. Every episode the uploader provided is listed and labelled.'
            : 'Find a film in Discover and choose “Save to Movies”.'
        }
      >
        <button type="button" className="btn btn-primary" onClick={() => archive.setTab('discover')}>
          <SearchIcon size={13} /> Browse the archive
        </button>
      </EmptyState>
    )
  }

  return (
    <>
      <div className="section-header" style={{ marginTop: 18 }}>
        <h2>
          Your {tab} <span className="section-count">{items.length}</span>
        </h2>
      </div>
      <div className="archive-grid">
        {items.map((item) => (
          <button
            type="button"
            key={item.identifier}
            className="archive-card"
            onClick={() => void archive.open(item.identifier)}
            title={item.title}
          >
            <span className="archive-poster">
              <span className="archive-poster-letter">{item.title.slice(0, 1).toUpperCase()}</span>
              <img
                src={item.posterUrl}
                alt=""
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.style.display = 'none'
                }}
              />
              <span className="archive-poster-tag">
                {item.kind === 'show' ? `${item.episodes.length} eps` : 'Film'}
              </span>
            </span>
            <span className="archive-card-body">
              <strong className="archive-card-title">{item.title}</strong>
              <span className="archive-card-meta">
                {[
                  item.year ? String(item.year) : null,
                  item.creator,
                  item.lastPlayedAt ? `played ${formatRelativeTime(item.lastPlayedAt)}` : null
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {item.lastEpisodeIndex !== null && item.episodes[item.lastEpisodeIndex] ? (
                <span className="archive-card-desc">Last: {item.episodes[item.lastEpisodeIndex]?.label}</span>
              ) : item.description ? (
                <span className="archive-card-desc">{item.description}</span>
              ) : null}
            </span>
          </button>
        ))}
      </div>
    </>
  )
}

function ArchiveDetail({
  item,
  opening,
  error
}: {
  item: ArchiveItemView
  opening: boolean
  error: string | null
}): ReactElement {
  const archive = useArchive()
  const totalDuration = item.episodes.reduce((sum, episode) => sum + (episode.durationMs ?? 0), 0)
  const captionCount = item.episodes.filter((episode) => episode.subtitleUrl !== null).length

  return (
    <div className="archive-detail-view">
      <button type="button" className="btn btn-sm btn-ghost archive-back" onClick={archive.closeSelected}>
        <ChevronLeftIcon size={14} /> Back to Archive
      </button>

      {error ? (
        <div className="card archive-banner is-error" role="alert">
          <AlertIcon size={15} />
          <div>
            <strong>The item could not be refreshed</strong>
            <p>{error}</p>
          </div>
        </div>
      ) : null}

      <div className="archive-detail">
        <aside className="archive-detail-art">
          <div className="archive-poster is-large">
            <span className="archive-poster-letter">{item.title.slice(0, 1).toUpperCase()}</span>
            <img
              src={item.posterUrl}
              alt=""
              onError={(event) => {
                event.currentTarget.style.display = 'none'
              }}
            />
          </div>

          <div className="archive-actions">
            {item.saved ? (
              <button type="button" className="btn btn-primary" onClick={() => void archive.forget(item.identifier)}>
                <TrashIcon size={13} /> Remove from library
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => void archive.save(item)}>
                <PlusIcon size={13} /> {item.kind === 'show' ? 'Save to Shows' : 'Save to Movies'}
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => void window.bunny.app.openExternal(item.detailUrl)}
            >
              <ExternalIcon size={13} /> Item page
            </button>
          </div>

          <div className="archive-rights">
            <span className="archive-rights-title">Rights</span>
            <p>{item.rights}</p>
            {item.licenseUrl ? (
              <button
                type="button"
                className="link-button"
                onClick={() => void window.bunny.app.openExternal(item.licenseUrl ?? item.detailUrl)}
              >
                Licence details
              </button>
            ) : null}
          </div>
        </aside>

        <div className="archive-detail-info">
          <span className="view-eyebrow">
            {item.kind === 'show' ? 'Series' : 'Film'} · Internet Archive
          </span>
          <h1 className="archive-detail-title">{item.title}</h1>
          <p className="archive-detail-meta">
            {[
              item.year ? String(item.year) : null,
              item.creator,
              item.collection?.replace(/_/g, ' '),
              `${item.episodes.length} ${item.episodes.length === 1 ? 'file' : 'episodes'}`,
              totalDuration > 0 ? formatDuration(totalDuration) : null,
              captionCount > 0 ? `${captionCount} with captions` : null
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>

          {item.description ? <p className="archive-detail-desc">{item.description}</p> : null}

          <div className="section-header" style={{ marginTop: 20 }}>
            <h2>Episodes</h2>
            <span className="faint" style={{ fontSize: 11.5 }}>
              {opening ? 'Refreshing…' : 'One entry per media file on archive.org'}
            </span>
          </div>

          <div className="archive-episodes">
            {item.episodes.map((episode) => (
              <EpisodeRow key={`${item.identifier}:${episode.index}`} item={item} episode={episode} />
            ))}
          </div>

          <p className="archive-footnote">
            Episodes are exactly the files the uploader provided — the app does not re-encode or split media, so a single
            long compilation stays one entry. Captions load when the item ships a usable SubRip/WebVTT sidecar; otherwise
            attach your own <span className="mono">.srt</span> or <span className="mono">.vtt</span> file (saved titles
            only).
          </p>
        </div>
      </div>
    </div>
  )
}

function EpisodeRow({ item, episode }: { item: ArchiveItemView; episode: ArchiveEpisodeView }): ReactElement {
  const archive = useArchive()
  const meta = [
    episode.durationMs ? formatDuration(episode.durationMs) : null,
    episode.sizeBytes ? formatFileSize(episode.sizeBytes) : null,
    episode.format || null
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="archive-episode">
      <button
        type="button"
        className="archive-episode-play"
        onClick={() => archive.play(item, episode)}
        aria-label={`Play ${episode.label}`}
        title={`Play ${episode.label}`}
      >
        <PlayIcon size={13} />
      </button>

      <div className="archive-episode-text">
        <span className="archive-episode-label" title={episode.label}>
          {episode.label}
        </span>
        <span className="archive-episode-meta">
          {meta}
          {episode.kind === 'unsupported' ? ' · needs VLC' : ''}
        </span>
      </div>

      {episode.attachedSubtitle ? (
        <>
          <span className="archive-cc is-attached" title={`Your file: ${episode.attachedSubtitle}`}>
            <CaptionsIcon size={13} /> CC
          </span>
          <button
            type="button"
            className="btn-icon btn-icon-sm"
            aria-label={`Remove subtitles from ${episode.label}`}
            title="Remove attached subtitles"
            onClick={() => void archive.detachSubtitle(item, episode)}
          >
            <TrashIcon size={12} />
          </button>
        </>
      ) : (
        <>
          {episode.subtitleUrl ? (
            <span
              className="archive-cc"
              title={`${episode.subtitleLabel ?? 'Captions'} — supplied by the archive item`}
            >
              <CaptionsIcon size={13} /> CC
            </span>
          ) : null}
          <button
            type="button"
            className="btn btn-sm btn-ghost archive-cc-add"
            disabled={!item.saved}
            title={
              item.saved
                ? 'Attach your own .srt or .vtt file to this episode'
                : 'Save this title to attach your own subtitles'
            }
            onClick={() => void archive.attachSubtitle(item, episode)}
          >
            <CaptionsIcon size={13} /> Add subs
          </button>
        </>
      )}

      <button
        type="button"
        className="btn-icon btn-icon-sm"
        aria-label={`Open ${episode.label} in VLC`}
        title="Open in VLC"
        onClick={() => void window.bunny.streams.openExternal(episode.url)}
      >
        <ExternalIcon size={12} />
      </button>
    </div>
  )
}
