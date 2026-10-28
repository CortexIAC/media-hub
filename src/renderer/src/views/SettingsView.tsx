import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import {
  BASS_BOOST_MAX,
  BOOST_MAX,
  EQ_BAND_LABELS,
  EQ_FREQUENCIES,
  EQ_MAX_DB,
  EQ_MIN_DB,
  EQ_PRESETS,
  SUPPORTED_AUDIO_EXTENSIONS,
  UNSUPPORTED_AUDIO_EXTENSIONS,
  equalizerIsFlat,
  equalizerNeedsGraph,
  type RepeatMode
} from '@core/models'
import { ACCENT_PRESETS } from '../theme/theme'
import { useData } from '../state/data'
import { useAppInfo } from '../state/meta'
import { usePlayerActions } from '../state/player'
import { ImportIcon, RefreshIcon } from '../components/Icons'

/** Formats an end-to-end playback test has actually exercised in this build. */
const VERIFIED_AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.flac'])

export function SettingsView(): ReactElement {
  const data = useData()
  const player = usePlayerActions()
  const info = useAppInfo()
  const [volume, setVolume] = useState(data.settings.volume)
  const [apiKey, setApiKey] = useState(data.settings.youtubeApiKey)

  useEffect(() => {
    setApiKey(data.settings.youtubeApiKey)
  }, [data.settings.youtubeApiKey])

  const equalizer = data.settings.equalizer

  useEffect(() => {
    setVolume(data.settings.volume)
  }, [data.settings.volume])

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-header-text">
          <span className="view-eyebrow">Preferences</span>
          <h1>Settings</h1>
          <p className="view-subtitle">Playback, library and appearance. Everything is stored locally on this machine.</p>
        </div>
      </div>

      <div className="settings-grid">
        <section className="settings-card">
          <h2>Playback</h2>

          <div className="settings-row">
            <span className="settings-label">
              Volume
              <span>Also available in the player bar</span>
            </span>
            <div className="row" style={{ minWidth: 180 }}>
              <input
                type="range"
                className="rail"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                aria-label="Volume"
                style={{ ['--fill' as string]: `${volume * 100}%` } as CSSProperties}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  setVolume(next)
                  player.setVolume(next)
                }}
              />
              <span className="settings-value">{Math.round(volume * 100)}%</span>
            </div>
          </div>

          <label className="checkbox">
            <input type="checkbox" checked={data.settings.muted} onChange={player.toggleMute} />
            Mute audio
          </label>

          <label className="checkbox">
            <input type="checkbox" checked={data.settings.shuffle} onChange={() => player.setShuffle(!data.settings.shuffle)} />
            Shuffle by default
          </label>

          <div className="settings-row">
            <span className="settings-label">Repeat</span>
            <select
              className="input input-sm"
              style={{ width: 130 }}
              value={data.settings.repeat}
              onChange={(event) => player.setRepeat(event.target.value as RepeatMode)}
              aria-label="Repeat mode"
            >
              <option value="off">Off</option>
              <option value="all">All</option>
              <option value="one">One track</option>
            </select>
          </div>
        </section>

        <section className="settings-card">
          <h2>Equalizer</h2>
          <p className="faint" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.6 }}>
            A five-band Web Audio equalizer applied inside the player, before the output device. It works on every locally
            supported format and is stored with your settings.
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={equalizer.enabled}
              onChange={(event) => player.setEqualizer({ ...equalizer, enabled: event.target.checked })}
            />
            Enable equalizer
          </label>

          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {EQ_PRESETS.map((preset) => {
              const active =
                equalizer.bands.length === preset.bands.length &&
                equalizer.bands.every((gain, index) => Math.abs(gain - (preset.bands[index] ?? 0)) < 0.05)
              return (
                <button
                  type="button"
                  key={preset.id}
                  className={`btn btn-sm ${active ? 'btn-primary' : ''}`}
                  onClick={() =>
                    player.setEqualizer({ ...equalizer, enabled: true, bands: [...preset.bands] })
                  }
                  aria-pressed={active}
                >
                  {preset.name}
                </button>
              )
            })}
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => player.setEqualizer({ ...equalizer, bands: [0, 0, 0, 0, 0], bassBoost: 0, boost: 1 })}
              disabled={equalizerIsFlat(equalizer)}
            >
              Reset
            </button>
          </div>

          <div className="eq-bands">
            {EQ_FREQUENCIES.map((frequency, index) => {
              const gain = equalizer.bands[index] ?? 0
              return (
                <label key={frequency} className="eq-band">
                  <span className="eq-band-value">{gain > 0 ? `+${gain}` : gain} dB</span>
                  <input
                    type="range"
                    className="rail eq-rail"
                    min={EQ_MIN_DB}
                    max={EQ_MAX_DB}
                    step={0.5}
                    value={gain}
                    aria-label={`${EQ_BAND_LABELS[index]} ${frequency} hertz gain`}
                    style={{ ['--fill' as string]: `${((gain - EQ_MIN_DB) / (EQ_MAX_DB - EQ_MIN_DB)) * 100}%` } as CSSProperties}
                    onChange={(event) => {
                      const bands = [...equalizer.bands]
                      bands[index] = Number(event.target.value)
                      player.setEqualizer({ ...equalizer, enabled: true, bands })
                    }}
                  />
                  <span className="eq-band-label">{EQ_BAND_LABELS[index]}</span>
                  <span className="eq-band-freq">{frequency >= 1000 ? `${frequency / 1000}k` : frequency} Hz</span>
                </label>
              )
            })}
          </div>
          <div className="settings-row">
            <span className="settings-label">
              Extra bass
              <span>Low shelf at 80 Hz, works with the EQ off</span>
            </span>
            <div className="row" style={{ minWidth: 200 }}>
              <input
                type="range"
                className="rail"
                min={0}
                max={BASS_BOOST_MAX}
                step={0.5}
                value={equalizer.bassBoost}
                aria-label="Extra bass boost"
                style={{ ['--fill' as string]: `${(equalizer.bassBoost / BASS_BOOST_MAX) * 100}%` } as CSSProperties}
                onChange={(event) =>
                  player.setEqualizer({ ...equalizer, bassBoost: Number(event.target.value) })
                }
              />
              <span className="settings-value">+{equalizer.bassBoost} dB</span>
            </div>
          </div>

          <div className="settings-row">
            <span className="settings-label">
              Audio boost
              <span>Output gain above 100%, limited to prevent clipping</span>
            </span>
            <div className="row" style={{ minWidth: 200 }}>
              <input
                type="range"
                className="rail"
                min={100}
                max={Math.round(BOOST_MAX * 100)}
                step={5}
                value={Math.round(equalizer.boost * 100)}
                aria-label="Audio boost"
                style={{
                  ['--fill' as string]: `${((equalizer.boost * 100 - 100) / (BOOST_MAX * 100 - 100)) * 100}%`
                } as CSSProperties}
                onChange={(event) =>
                  player.setEqualizer({ ...equalizer, boost: Number(event.target.value) / 100 })
                }
              />
              <span className="settings-value">{Math.round(equalizer.boost * 100)}%</span>
            </div>
          </div>

          <p className="faint" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.6 }}>
            {equalizerNeedsGraph(equalizer)
              ? `Processing active — EQ ${equalizer.enabled ? 'on' : 'off'}, bass +${equalizer.bassBoost} dB, boost ${Math.round(equalizer.boost * 100)}%.`
              : 'Bypassed — audio goes straight to the output device with no filtering.'}
          </p>
        </section>

        <section className="settings-card">
          <h2>Online catalogues</h2>
          <p className="faint" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.6 }}>
            Open Library, Project Gutenberg, LibriVox and the Internet Archive are searched without a key. YouTube search is
            optional and read-only: results open in your browser, because YouTube&apos;s terms forbid extracting or playing audio
            outside its own player.
          </p>
          <div className="settings-row" style={{ alignItems: 'flex-start' }}>
            <span className="settings-label">
              YouTube Data API key
              <span>Optional · search only</span>
            </span>
            <div className="row" style={{ minWidth: 240, flexWrap: 'wrap' }}>
              <input
                type="password"
                className="input input-sm"
                placeholder="Paste an API key"
                value={apiKey}
                aria-label="YouTube Data API key"
                onChange={(event) => setApiKey(event.target.value)}
                style={{ minWidth: 180 }}
              />
              <button
                type="button"
                className="btn btn-sm"
                disabled={apiKey === data.settings.youtubeApiKey}
                onClick={() => void data.updateSettings({ youtubeApiKey: apiKey.trim() })}
              >
                Save
              </button>
            </div>
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => void window.bunny.app.openExternal('https://console.cloud.google.com/apis/library/youtube.googleapis.com')}
            >
              Get a YouTube key
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => void window.bunny.app.openExternal('https://openlibrary.org')}
            >
              Open Library
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => void window.bunny.app.openExternal('https://www.gutenberg.org')}
            >
              Project Gutenberg
            </button>
          </div>
        </section>

        <section className="settings-card">
          <h2>Library</h2>
          <div className="settings-row">
            <span className="settings-label">Imported folders</span>
            <span className="settings-value">{data.folders.length}</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">Tracks</span>
            <span className="settings-value">{data.tracks.length.toLocaleString()}</span>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={data.settings.scanOnStartup}
              onChange={(event) => void data.updateSettings({ scanOnStartup: event.target.checked })}
            />
            Incrementally rescan folders on launch
          </label>
          <p className="faint" style={{ fontSize: 11.5, lineHeight: 1.6, margin: 0 }}>
            Rescans only re-read files whose size or modification time changed, so a large library is cheap to check.
          </p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm" onClick={() => void data.importFolder()} disabled={data.scanning !== null}>
              <ImportIcon size={14} /> Import folder
            </button>
            <button type="button" className="btn btn-sm" onClick={() => void data.verifyLibrary()}>
              <RefreshIcon size={14} /> Verify files
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => void window.bunny.app.openDataDir()}>
              Open data folder
            </button>
          </div>
        </section>

        <section className="settings-card">
          <h2>Appearance</h2>
          <p className="faint" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.6 }}>
            The accent is a single theme token, so a future BunnyOS appearance service can drive it without touching components.
          </p>
          <div className="swatches">
            {ACCENT_PRESETS.map((preset) => (
              <button
                type="button"
                key={preset.value}
                className={`swatch ${data.settings.accent.toLowerCase() === preset.value.toLowerCase() ? 'is-active' : ''}`}
                title={preset.name}
                aria-label={`Accent ${preset.name}`}
                aria-pressed={data.settings.accent.toLowerCase() === preset.value.toLowerCase()}
                onClick={() => void data.updateSettings({ accent: preset.value })}
              >
                <span className="swatch-inner" style={{ background: preset.value }} />
              </button>
            ))}
          </div>
        </section>

        <section className="settings-card">
          <h2>Supported audio</h2>
          <p className="faint" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.6 }}>
            These containers are opened by the scanner and handed to Chromium’s decoder. Formats marked ✓ have been proven to play in
            this build by automated tests; the rest are accepted and scanned but not yet playback-verified.
          </p>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {SUPPORTED_AUDIO_EXTENSIONS.map((extension) => (
              <span
                key={extension}
                className="badge"
                title={
                  VERIFIED_AUDIO_EXTENSIONS.has(extension)
                    ? 'Playback verified in this build'
                    : 'Accepted by the scanner; playback not verified yet'
                }
              >
                {extension}
                {VERIFIED_AUDIO_EXTENSIONS.has(extension) ? ' ✓' : ''}
              </span>
            ))}
          </div>
          <p className="faint" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.6 }}>
            Recognised but not claimed: {UNSUPPORTED_AUDIO_EXTENSIONS.join(', ')}. They are counted during a scan rather than
            silently ignored.
          </p>
        </section>

        <section className="settings-card">
          <h2>About</h2>
          <table className="data-table">
            <tbody>
              <tr>
                <td>Application</td>
                <td>{info ? `${info.name} ${info.version}` : '…'}</td>
              </tr>
              <tr>
                <td>Electron</td>
                <td>{info?.electron ?? '…'}</td>
              </tr>
              <tr>
                <td>Chromium</td>
                <td>{info?.chrome ?? '…'}</td>
              </tr>
              <tr>
                <td>Node</td>
                <td>{info?.node ?? '…'}</td>
              </tr>
              <tr>
                <td>Data folder</td>
                <td className="mono" style={{ overflowWrap: 'anywhere' }}>
                  {info?.dataDir ?? '…'}
                </td>
              </tr>
              <tr>
                <td>Artwork cache</td>
                <td className="mono" style={{ overflowWrap: 'anywhere' }}>
                  {info?.artworkDir ?? '…'}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="faint" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.6 }}>
            Sprint 1 build. No accounts, telemetry or network requests. Provider integrations and video are documented as planned,
            not implemented.
          </p>
        </section>

        <section className="settings-card">
          <h2>Keyboard shortcuts</h2>
          <table className="data-table">
            <tbody>
              <Shortcut keys="Space" action="Play or pause" />
              <Shortcut keys="Ctrl ← / →" action="Previous / next track" />
              <Shortcut keys="← / →" action="Seek 5 seconds" />
              <Shortcut keys="↑ / ↓" action="Volume up / down" />
              <Shortcut keys="M" action="Mute" />
              <Shortcut keys="S" action="Toggle shuffle" />
              <Shortcut keys="R" action="Cycle repeat" />
              <Shortcut keys="Ctrl F" action="Focus search" />
              <Shortcut keys="Ctrl I" action="Import a folder" />
              <Shortcut keys="Ctrl Shift Q" action="Toggle queue" />
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}

function Shortcut({ keys, action }: { keys: string; action: string }): ReactElement {
  return (
    <tr>
      <td style={{ width: 140 }}>
        <span className="badge">{keys}</span>
      </td>
      <td>{action}</td>
    </tr>
  )
}
