import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { formatYouTubeTime, parseYouTubeTarget, uniqueVideos, type YouTubeVideo } from '@core/youtube'
import type { YouTubeLibraryView, YouTubeSearchResult } from '@shared/ipc'
import { EmptyState } from '../components/EmptyState'
import {
  ExternalIcon,
  HeartIcon,
  MusicIcon,
  PlayIcon,
  PlusIcon,
  QueueIcon,
  SearchIcon,
  SkipBackIcon,
  SkipForwardIcon,
  TrashIcon,
  VideoIcon
} from '../components/Icons'
import { YouTubePlayer } from '../components/YouTubePlayer'
import type { YouTubePlaybackState } from '../playback/youtubePlayer'
import { useData } from '../state/data'
import { useUi } from '../state/ui'

type Tab = 'search' | 'favorites' | 'history'

/**
 * YouTube discovery and playback. Search uses the Data API when a key is set;
 * any single video link can be played without a key because playback happens in
 * YouTube's own embedded player.
 */
export function VideoView(): ReactElement {
  const data = useData()
  const ui = useUi()
  const hasKey = data.settings.youtubeApiKey.trim().length > 0

  const [tab, setTab] = useState<Tab>('search')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<YouTubeSearchResult | null>(null)
  const [searching, setSearching] = useState(false)
  const [library, setLibrary] = useState<YouTubeLibraryView>({ favorites: [], history: [] })
  const [current, setCurrent] = useState<YouTubeVideo | null>(null)
  const [queue, setQueue] = useState<YouTubeVideo[]>([])
  const [played, setPlayed] = useState<YouTubeVideo[]>([])
  const [playerState, setPlayerState] = useState<YouTubePlaybackState>('unstarted')
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.bunny.youtube
      .state()
      .then((state) => {
        if (!cancelled) setLibrary(state)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const play = useCallback((video: YouTubeVideo) => {
    setCurrent((previous) => {
      if (previous && previous.id !== video.id) setPlayed((stack) => [previous, ...stack].slice(0, 50))
      return video
    })
    setQueue((items) => items.filter((item) => item.id !== video.id))
    void window.bunny.youtube.addHistory(video).then(setLibrary).catch(() => undefined)
  }, [])

  const next = useCallback(() => {
    setQueue((items) => {
      const [head, ...rest] = items
      if (!head) return items
      setCurrent((previous) => {
        if (previous) setPlayed((stack) => [previous, ...stack].slice(0, 50))
        return head
      })
      void window.bunny.youtube.addHistory(head).then(setLibrary).catch(() => undefined)
      return rest
    })
  }, [])

  const previous = useCallback(() => {
    setPlayed((stack) => {
      const [head, ...rest] = stack
      if (!head) return stack
      setCurrent((old) => {
        if (old) setQueue((items) => [old, ...items])
        return head
      })
      return rest
    })
  }, [])

  const addToQueue = useCallback((video: YouTubeVideo) => {
    setQueue((items) => uniqueVideos([...items, video]))
  }, [])

  const playNext = useCallback((video: YouTubeVideo) => {
    setQueue((items) => uniqueVideos([video, ...items.filter((item) => item.id !== video.id)]))
  }, [])

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
        play(resolved.video)
        setLink('')
      } else {
        setLinkError(resolved.error ?? 'That video could not be resolved.')
      }
    } finally {
      setResolving(false)
    }
  }

  const toggleFavorite = (video: YouTubeVideo): void => {
    void window.bunny.youtube.toggleFavorite(video).then(setLibrary).catch(() => undefined)
  }

  const favoriteIds = useMemo(() => new Set(library.favorites.map((video) => video.id)), [library.favorites])
  const visible: YouTubeVideo[] = tab === 'favorites' ? library.favorites : tab === 'history' ? library.history : search?.videos ?? []

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-header-text">
          <span className="view-eyebrow">Video · YouTube</span>
          <h1>Video</h1>
          <p className="view-subtitle">
            Search YouTube and watch in the official embedded player. Playback stays visible here — YouTube’s terms do not allow
            hidden or background playback, so leaving this screen stops the video.
          </p>
        </div>
      </div>

      {current ? (
        <section className="yt-stage">
          <YouTubePlayer
            videoId={current.id}
            title={current.title}
            onStateChange={setPlayerState}
            onEnded={() => {
              if (queue.length > 0) next()
            }}
          />
          <div className="yt-now">
            <div style={{ minWidth: 0 }}>
              <div className="yt-now-title">{current.title}</div>
              <div className="yt-now-sub">
                {[current.channel, current.durationMs ? formatYouTubeTime(current.durationMs) : null, playerState].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn btn-sm ${favoriteIds.has(current.id) ? 'btn-primary' : ''}`}
                onClick={() => toggleFavorite(current)}
                aria-pressed={favoriteIds.has(current.id)}
              >
                <HeartIcon size={14} filled={favoriteIds.has(current.id)} /> {favoriteIds.has(current.id) ? 'Saved' : 'Save'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => void window.bunny.app.openExternal(current.url)}
              >
                <ExternalIcon size={14} /> YouTube
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={previous} disabled={played.length === 0}>
                <SkipBackIcon size={14} /> Previous
              </button>
              <button type="button" className="btn btn-sm" onClick={next} disabled={queue.length === 0}>
                Next <SkipForwardIcon size={14} />
              </button>
            </div>
          </div>
        </section>
      ) : (
        <div className="card yt-intro">
          <span className="empty-icon" style={{ flex: 'none' }}>
            <VideoIcon size={22} />
          </span>
          <div>
            <div className="card-title">Search, or paste any YouTube link</div>
            <p className="card-body">
              Playback runs in YouTube’s own player, so it counts as a real view and keeps ads and attribution intact. Searching
              needs no key; a pasted link plays straight away.
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
      {linkError ? <p className="faint" style={{ fontSize: 12, marginTop: -6 }}>{linkError}</p> : null}

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
            {entry === 'search' ? 'Results' : entry === 'favorites' ? `Saved (${library.favorites.length})` : `Recent (${library.history.length})`}
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
            <article className="yt-card" key={video.id}>
              <button type="button" className="yt-thumb" aria-label={`Play YouTube ${video.title}`} onClick={() => play(video)}>
                <img src={video.thumbnailUrl} alt="" loading="lazy" />
                <span className="yt-thumb-play">
                  <PlayIcon size={18} />
                </span>
                {video.durationMs ? <span className="yt-thumb-time">{formatYouTubeTime(video.durationMs)}</span> : null}
              </button>
              <div className="yt-card-body">
                <div className="yt-card-title" title={video.title}>
                  {video.title}
                </div>
                <div className="yt-card-sub">{video.channel ?? 'YouTube'}</div>
                <div className="yt-card-actions">
                  <button type="button" className="btn btn-sm" onClick={() => play(video)}>
                    <PlayIcon size={12} /> Play
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" aria-label={`Play next: ${video.title}`} onClick={() => playNext(video)}>
                    <SkipForwardIcon size={12} /> Next
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" aria-label={`Add to queue: ${video.title}`} onClick={() => addToQueue(video)}>
                    <PlusIcon size={12} /> Queue
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm btn-ghost ${favoriteIds.has(video.id) ? 'is-active' : ''}`}
                    aria-label={favoriteIds.has(video.id) ? `Remove ${video.title} from saved videos` : `Save ${video.title}`}
                    aria-pressed={favoriteIds.has(video.id)}
                    onClick={() => toggleFavorite(video)}
                  >
                    <HeartIcon size={12} filled={favoriteIds.has(video.id)} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {queue.length > 0 ? (
        <section className="section">
          <div className="section-header">
            <h2>
              <QueueIcon size={14} /> Up next · {queue.length}
            </h2>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setQueue([])}>
              Clear queue
            </button>
          </div>
          <div className="discovery-list">
            {queue.map((video, index) => (
              <div className="discovery-row" key={video.id}>
                <span className="discovery-glyph" aria-hidden="true">
                  {index + 1}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="discovery-title">{video.title}</div>
                  <div className="discovery-meta">{video.channel ?? 'YouTube'}</div>
                </div>
                <div className="discovery-badges">
                  <button type="button" className="btn btn-sm" onClick={() => play(video)}>
                    <PlayIcon size={12} /> Play
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    aria-label={`Remove ${video.title} from queue`}
                    onClick={() => setQueue((items) => items.filter((item) => item.id !== video.id))}
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
