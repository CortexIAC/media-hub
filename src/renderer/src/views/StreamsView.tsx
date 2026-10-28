import { useMemo, useState, type FormEvent, type ReactElement } from 'react'
import { STREAM_SEEDS } from '@core/streamSeeds'
import { streamHostLabel } from '@core/streams'
import type { StreamSourceView } from '@shared/ipc'
import { AlertIcon, ExternalIcon, PlayIcon, PlusIcon, SearchIcon, StreamsIcon, TrashIcon } from '../components/Icons'
import { ProviderCard } from '../components/ProviderCard'
import { useProviders } from '../state/meta'
import { useStreams } from '../state/streams'

const UNGROUPED = 'Saved streams'

export function StreamsView(): ReactElement {
  const streams = useStreams()
  const providers = useProviders()
  const [input, setInput] = useState('')
  const [filter, setFilter] = useState('')

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const value = input.trim()
    if (value.length === 0) return
    const result = await streams.add(value)
    // Keep the text on failure so the user can correct a typo instead of
    // retyping a long playlist URL.
    if (result?.ok) setInput('')
  }

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase()
    if (query.length === 0) return streams.sources
    return streams.sources.filter((source) =>
      `${source.name} ${source.url} ${source.group ?? ''}`.toLowerCase().includes(query)
    )
  }, [streams.sources, filter])

  const groups = useMemo(() => {
    const grouped = new Map<string, StreamSourceView[]>()
    for (const source of visible) {
      const key = source.group ?? UNGROUPED
      const bucket = grouped.get(key)
      if (bucket) bucket.push(source)
      else grouped.set(key, [source])
    }
    return [...grouped.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([group, items]) => [group, [...items].sort((a, b) => a.name.localeCompare(b.name))] as const)
  }, [visible])

  const unsupportedCount = streams.sources.filter((source) => source.kind === 'unsupported').length

  const missingSuggestions = useMemo(() => {
    const saved = new Set(streams.sources.map((source) => source.url))
    return STREAM_SEEDS.filter((seed) => !saved.has(seed.url)).length
  }, [streams.sources])

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-header-text">
          <span className="view-eyebrow">Network playback</span>
          <h1>Streams</h1>
          <p className="view-subtitle">
            Play a link you already have — a direct media URL, an HLS playlist, or an M3U/PLS channel list. Playback stays
            inside the app and keeps going while you browse; formats Chromium cannot decode are handed to VLC.
          </p>
        </div>
      </div>

      <form className="stream-add card" onSubmit={submit}>
        <div className="stream-add-row">
          <input
            className="input stream-add-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="https://example.com/live/index.m3u8  ·  or a direct .mp4 / .mp3 link"
            aria-label="Stream URL"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primary" disabled={streams.adding || input.trim().length === 0}>
            <PlusIcon size={13} /> {streams.adding ? 'Checking…' : 'Add stream'}
          </button>
        </div>
        <p className="stream-add-hint">
          The link is checked before it is saved, so a typo or an offline server is reported immediately. A channel list is
          expanded into individual entries; an <span className="mono">.m3u8</span> is kept as one stream.
        </p>
      </form>

      <section className="section">
        <div className="section-header">
          <h2>
            Your streams
            {streams.sources.length > 0 ? <span className="section-count">{streams.sources.length}</span> : null}
          </h2>
          {streams.sources.length > 0 ? (
            <div className="stream-filter">
              <SearchIcon size={13} />
              <input
                className="input input-sm"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter streams"
                aria-label="Filter streams"
                spellCheck={false}
              />
            </div>
          ) : null}
        </div>

        {streams.sources.length === 0 ? (
          <div className="card empty-state">
            <span className="empty-icon">
              <StreamsIcon size={22} />
            </span>
            <h3>No streams yet</h3>
            <p>
              The suggested list below covers public radio, NASA TV and public-domain film and audiobooks. Everything else
              is a link you supply — nothing here searches trackers or scrapes a catalogue.
            </p>
            <ul className="stream-examples">
              <li>
                <span className="mono">…/live/index.m3u8</span> — HLS, played with a bundled player
              </li>
              <li>
                <span className="mono">…/channel.m3u</span> — a channel list, expanded into entries
              </li>
              <li>
                <span className="mono">…/broadcast.mp4</span> — direct media, seekable
              </li>
            </ul>
          </div>
        ) : visible.length === 0 ? (
          <div className="card empty-state">
            <h3>No match for “{filter}”</h3>
            <p>Rename a stream or clear the filter.</p>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setFilter('')}>
              Clear filter
            </button>
          </div>
        ) : (
          <div className="stream-groups">
            {groups.map(([group, items]) => (
              <div key={group} className="stream-group">
                <div className="stream-group-head">
                  <h3>{group}</h3>
                  <span className="stream-group-count">{items.length}</span>
                </div>
                {items.map((source) => (
                  <StreamRow key={source.id} source={source} />
                ))}
              </div>
            ))}
          </div>
        )}

        {missingSuggestions > 0 ? (
          <div className="stream-suggestions">
            <span>
              {missingSuggestions} suggested {missingSuggestions === 1 ? 'stream is' : 'streams are'} not in your list.
            </span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => void streams.addSuggested()}>
              <PlusIcon size={12} /> Add suggested streams
            </button>
          </div>
        ) : null}

        {unsupportedCount > 0 ? (
          <p className="stream-note">
            <AlertIcon size={13} /> {unsupportedCount} saved{' '}
            {unsupportedCount === 1 ? 'stream needs' : 'streams need'} an external player — Chromium cannot decode their
            container. Select one and choose <strong>Open in VLC</strong>.
          </p>
        ) : null}
      </section>

      <section className="section">
        <div className="section-header">
          <h2>What this build can play</h2>
        </div>
        <div className="card stream-capabilities">
          <div>
            <span className="stream-capability-title">In-app</span>
            <p>
              MP4/H.264 and WebM over HTTP(S), MP3/AAC/FLAC/WAV audio, and HLS (<span className="mono">.m3u8</span>)
              including adaptive variants. Seeking works where the server supports range requests.
            </p>
          </div>
          <div>
            <span className="stream-capability-title">External player</span>
            <p>
              MKV, AVI, MPEG-TS, HEVC and other containers Chromium does not decode. VLC is launched with the same URL when
              it is installed; otherwise the link opens in your default handler.
            </p>
          </div>
          <div>
            <span className="stream-capability-title">Not supported</span>
            <p>
              Torrent or magnet links, and indexer metadata APIs. The app plays streams over HTTP(S); it does not search
              trackers or resolve stream endpoints for you.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <h2>Provider contracts</h2>
        </div>
        <p className="section-note">
          Saved links above are independent of these. Each provider below records what its platform actually permits,
          including the cases where a feature cannot be offered at all.
        </p>
        <div className="provider-list">
          {providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
      </section>
    </div>
  )
}

function StreamRow({ source }: { source: StreamSourceView }): ReactElement {
  const streams = useStreams()
  const active = streams.current?.id === source.id
  const playing = active && streams.status === 'playing'

  return (
    <div className={`stream-row ${active ? 'is-active' : ''}`}>
      <button
        type="button"
        className="stream-play"
        onClick={() => streams.play(source)}
        aria-label={`Play ${source.name}`}
        title={`Play ${source.name}`}
      >
        <PlayIcon size={14} />
      </button>
      <div className="stream-row-text">
        <span className="stream-row-name">{source.name}</span>
        <span className="stream-row-meta">
          {streamHostLabel(source.url) || 'stream'}
          {source.kind === 'hls' ? ' · HLS' : source.kind === 'unsupported' ? ' · external player' : ' · direct'}
        </span>
      </div>
      {playing ? <span className="stream-row-live">Playing</span> : null}
      <div className="stream-row-actions">
        <button
          type="button"
          className="btn-icon btn-icon-sm"
          aria-label={`Open ${source.name} in an external player`}
          title="Open in VLC"
          onClick={() => void streams.openExternally(source)}
        >
          <ExternalIcon size={13} />
        </button>
        <button
          type="button"
          className="btn-icon btn-icon-sm"
          aria-label={`Remove ${source.name}`}
          title="Remove"
          onClick={() => void streams.remove(source.id)}
        >
          <TrashIcon size={13} />
        </button>
      </div>
    </div>
  )
}
