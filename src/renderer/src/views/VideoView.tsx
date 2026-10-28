import { useEffect, useRef, useState, type ReactElement } from 'react'
import { formatYouTubeTime, parseYouTubeTarget, type YouTubeVideo } from '@core/youtube'
import type { YouTubeSearchResult } from '@shared/ipc'
import { EmptyState } from '../components/EmptyState'
import {
  ExternalIcon,
  HeartIcon,
  MusicIcon,
  PlayIcon,
  QueueIcon,
  SearchIcon,
  SkipBackIcon,
  SkipForwardIcon,
  TrashIcon,
  VideoIcon
} from '../components/Icons'
import { YouTubeCard } from '../components/YouTubeCard'
import { useData } from '../state/data'
import { useUi } from '../state/ui'
import { useYouTube } from '../state/youtube'

type Tab = 'search' | 'favorites' | 'history'

/**
 * YouTube discovery and queue management.
 *
 * The player element itself lives in the shell (`YouTubeStage`), so it keeps
 * playing when this view is left. This screen owns the search box, the saved and
 * recent lists, and the queue.
 */
export function VideoView(): ReactElement {
  const data = useData()
  const ui = useUi()
  const youtube = useYouTube()
  const hasKey = data.settings.youtubeApiKey.trim().length > 0

  const [tab, setTab] = useState<Tab>('search')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<YouTubeSearchResult | null>(null)
  const [searching, setSearching] = useState(false)
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)

  const current = youtube.current
  const viewRef = useRef<HTMLDivElement>(null)

  // The player sits above this view, so a new video should be seen from the top
  // of the list rather than wherever the previous one left the scroll position.
  useEffect(() => {
    if (current) viewRef.current?.scrollTo({ top: 0 })
  }, [current?.id])

  const runSearch = async (): Promise<void> => {
    const text = query.trim()
    if (text.length < 2) return
    setSearching(true)
    try {
      const result = await window.bunny.youtube.search(text)
      setSearch(result)
      setTab('search')
    } catch (error) {
      setSearch({ videos: [], needsKey: false, error: error instanceof Error ? error.message : String(error) })
    } finally {
      setSearching(false)
    }
  }

  const playLink = async (): Promise<void> => {
    const target = parseYouTubeTarget(link)
    if (!target) {
      setLinkError('Paste a YouTube video link, e.g. https://www.youtube.com/watch?v=… or https://youtu.be/…')
      return
    }
    if (target.kind === 'playlist') {
      setLinkError('Playlist links are not supported yet — paste a single video link.')
      return
    }
    setLinkError(null)
    setResolving(true)
    try {
      const resolved = await window.bunny.youtube.resolve(link)
      if (resolved.video) {
        youtube.play(resolved.video)
        setLink('')
      } else {
        setLinkError(resolved.error ?? 'That video could not be resolved.')
      }
    } finally {
      setResolving(false)
    }
  }

  const visible: YouTubeVideo[] =
    tab === 'favorites' ? youtube.library.favorites : tab === 'history' ? youtube.library.history : search?.videos ?? []

  const isCurrent = (video: YouTubeVideo): boolean => current?.id === video.id

  return (
    <div className="view" ref={viewRef}>
      {current ? null : (
        <div className="view-header">
          <div className="view-header-text">
            <span className="view-eyebrow">Video · YouTube</span>
            <h1>Video</h1>
            <p className="view-subtitle">
              Playback runs in YouTube’s own player. It keeps playing while you browse the rest of the app — the player stays
              visible in the corner, because YouTube’s terms do not allow hidden or background playback, and it pauses when the
              window is minimised.
            </p>
          </div>
        </div>
      )}

      {current ? (
        <div className="yt-now">
          <div style={{ minWidth: 0 }}>
            <span className="view-eyebrow yt-now-eyebrow">Video · YouTube</span>
            <div className="yt-now-title">{current.title}</div>
            <div className="yt-now-sub">
              {[current.channel, current.durationMs ? formatYouTubeTime(current.durationMs) : null, youtube.playerState]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn btn-sm ${youtube.favoriteIds.has(current.id) ? 'btn-primary' : ''}`}
              onClick={() => youtube.toggleFavorite(current)}
              aria-pressed={youtube.favoriteIds.has(current.id)}
            >
              <HeartIcon size={14} filled={youtube.favoriteIds.has(current.id)} />{' '}
              {youtube.favoriteIds.has(current.id) ? 'Saved' : 'Save'}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => void window.bunny.app.openExternal(current.url)}>
              <ExternalIcon size={14} /> YouTube
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={youtube.previous}
              disabled={youtube.played.length === 0}
            >
              <SkipBackIcon size={14} /> Previous
            </button>
            <button type="button" className="btn btn-sm" onClick={youtube.next} disabled={youtube.queue.length === 0}>
              Next <SkipForwardIcon size={14} />
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={youtube.stop}>
              Stop
            </button>
          </div>
        </div>
      ) : (
        <div className="card yt-intro">
          <span className="empty-icon" style={{ flex: 'none' }}>
            <VideoIcon size={22} />
          </span>
          <div>
            <div className="card-title">Search, or paste any YouTube link</div>
            <p className="card-body">
              Playback runs in YouTube’s own player, so it counts as a real view and keeps ads and attribution intact. Searching
              needs no key; a pasted link plays straight away. Picking a result starts playback and leaves the player at the top of
              this screen.
            </p>
          </div>
        </div>
      )}

      <div className="yt-search-row">
        <div className="search-field" style={{ flex: 1 }}>
          <SearchIcon size={15} />
          <input
            id="youtube-search"
            className="input"
            type="search"
            placeholder="Search YouTube — songs, artists, remixes, live performances…"
            value={query}
            aria-label="Search YouTube"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void runSearch()
            }}
          />
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void runSearch()} disabled={searching || query.trim().length < 2}>
          {searching ? 'Searching…' : 'Search'}
        </button>
        {search && search.videos.length > 1 ? (
          <button type="button" className="btn" onClick={() => youtube.playList(search.videos, 0)}>
            <PlayIcon size={13} /> Play all
          </button>
        ) : null}
      </div>

      <div className="yt-link-row">
        <input
          className="input"
          placeholder="Paste a video link to play it without a key"
          value={link}
          aria-label="YouTube video link"
          onChange={(event) => setLink(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void playLink()
          }}
        />
        <button type="button" className="btn" onClick={() => void playLink()} disabled={resolving || link.trim().length === 0}>
          {resolving ? 'Opening…' : 'Play link'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => ui.navigate({ name: 'settings' })}>
          YouTube key settings
        </button>
      </div>
      {linkError ? (
        <p className="faint" style={{ fontSize: 12, marginTop: -6 }}>
          {linkError}
        </p>
      ) : null}

      {search?.warning ? (
        <p className="faint" style={{ fontSize: 12, marginTop: -6 }}>
          {search.warning}
        </p>
      ) : null}
      {search?.error ? (
        <p className="faint" style={{ fontSize: 12, marginTop: -6 }}>
          {search.error}
        </p>
      ) : null}

      {!hasKey ? (
        <div className="card yt-key-card">
          <div className="card-title">Search works without a key</div>
          <p className="card-body">
            Results come from YouTube&apos;s own public search, so there is nothing to sign up for. A free Data API key is optional:
            it uses Google&apos;s documented API instead of the web search endpoint, which survives changes YouTube makes to that
            endpoint.
          </p>
          <ol className="yt-steps">
            <li>Open Google Cloud Console → APIs &amp; Services → Library → “YouTube Data API v3” → Enable.</li>
            <li>Credentials → Create credentials → API key, then copy it.</li>
            <li>Paste it in Settings → Online catalogues → YouTube Data API key.</li>
          </ol>
          <p className="card-body">The key stays on this machine and is only used for search.</p>
          <div className="row">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void window.bunny.app.openExternal('https://console.cloud.google.com/apis/library/youtube.googleapis.com')}
            >
              <ExternalIcon size={13} /> Open Google Cloud
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => ui.navigate({ name: 'settings' })}>
              Open settings
            </button>
          </div>
        </div>
      ) : null}

      <div className="yt-tabs" role="tablist" aria-label="Video lists">
        {(['search', 'favorites', 'history'] as Tab[]).map((entry) => (
          <button
            type="button"
            key={entry}
            role="tab"
            aria-selected={tab === entry}
            className={`btn btn-sm ${tab === entry ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab(entry)}
          >
            {entry === 'search'
              ? 'Results'
              : entry === 'favorites'
                ? `Saved (${youtube.library.favorites.length})`
                : `Recent (${youtube.library.history.length})`}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<MusicIcon size={22} />}
          title={tab === 'search' ? 'No results yet' : tab === 'favorites' ? 'Nothing saved' : 'Nothing played yet'}
          message={
            tab === 'search'
              ? "Search for a song, artist or video. Selecting a result plays it in YouTube's own embedded player above."
              : tab === 'favorites'
                ? 'Save a video with the heart button while it is playing.'
                : 'Videos you play appear here.'
          }
        />
      ) : (
        <div className="yt-grid">
          {visible.map((video) => (
            <YouTubeCard
              key={video.id}
              video={video}
              favorite={youtube.favoriteIds.has(video.id)}
              playing={isCurrent(video) && youtube.playerState === 'playing'}
              onPlay={() => youtube.play(video)}
              onPlayNext={() => youtube.playNextUp(video)}
              onEnqueue={() => youtube.enqueue(video)}
              onToggleFavorite={() => youtube.toggleFavorite(video)}
            />
          ))}
        </div>
      )}

      {youtube.queue.length > 0 ? (
        <section className="section">
          <div className="section-header">
            <h2>
              <QueueIcon size={14} /> Up next · {youtube.queue.length}
            </h2>
            <button type="button" className="btn btn-sm btn-ghost" onClick={youtube.clearQueue}>
              Clear queue
            </button>
          </div>
          <div className="discovery-list">
            {youtube.queue.map((video, index) => (
              <div className="discovery-row" key={video.id}>
                <span className="discovery-glyph" aria-hidden="true">
                  {index + 1}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="discovery-title">{video.title}</div>
                  <div className="discovery-meta">{video.channel ?? 'YouTube'}</div>
                </div>
                <div className="discovery-badges">
                  <button type="button" className="btn btn-sm" onClick={() => youtube.play(video)}>
                    <PlayIcon size={12} /> Play
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    aria-label={`Remove ${video.title} from queue`}
                    onClick={() => youtube.removeFromQueue(video.id)}
                  >
                    <TrashIcon size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
