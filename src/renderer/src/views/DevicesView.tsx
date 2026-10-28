import type { ReactElement } from 'react'
import { DevicesIcon } from '../components/Icons'
import { useAppInfo } from '../state/meta'

const SYNC_LAYERS: Array<{ layer: string; purpose: string; status: string }> = [
  { layer: 'Device identity', purpose: 'Stable id, display name, platform and capabilities announced to the session.', status: 'Interface defined' },
  { layer: 'Session state', purpose: 'Leader device, member list, revision counter and join/leave lifecycle.', status: 'Interface defined' },
  { layer: 'Playback timeline', purpose: 'Authoritative track, anchor time, position, rate and revision.', status: 'Interface defined' },
  { layer: 'Clock synchronisation', purpose: 'Round-trip offset estimation so followers can derive the expected position.', status: 'Interface defined' },
  { layer: 'Remote commands', purpose: 'Play, pause, seek, next, previous and volume delivered to a leader device.', status: 'Interface defined' },
  { layer: 'Transport', purpose: 'Local-network discovery and message delivery between devices.', status: 'Not implemented' }
]

export function DevicesView(): ReactElement {
  const info = useAppInfo()

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-header-text">
          <span className="view-eyebrow">Planned · not in Sprint 1</span>
          <h1>Devices</h1>
          <p className="view-subtitle">
            Bunny Sync will let multiple devices follow one playback timeline. No networking, discovery or remote playback is
            implemented in this build, and no fake device list is shown.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <span className="empty-icon" style={{ flex: 'none' }}>
          <DevicesIcon size={22} />
        </span>
        <div>
          <div className="card-title">This device</div>
          <div className="card-body">
            {info ? (
              <table className="data-table" style={{ marginTop: 6 }}>
                <tbody>
                  <tr>
                    <td style={{ width: 140 }}>Application</td>
                    <td>
                      {info.name} {info.version}
                    </td>
                  </tr>
                  <tr>
                    <td>Platform</td>
                    <td>{info.platform === 'win32' ? 'Windows' : info.platform}</td>
                  </tr>
                  <tr>
                    <td>Role</td>
                    <td>Local playback device (no sync session)</td>
                  </tr>
                  <tr>
                    <td>Library</td>
                    <td className="mono">{info.dataDir}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              'Reading device information…'
            )}
          </div>
        </div>
      </div>

      <section className="section">
        <div className="section-header">
          <h2>Designed layers</h2>
          <span className="faint" style={{ fontSize: 12 }}>
            Contracts exist in <span className="mono">src/core/sync.ts</span>
          </span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Layer</th>
              <th>Purpose</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {SYNC_LAYERS.map((entry) => (
              <tr key={entry.layer}>
                <td>{entry.layer}</td>
                <td>{entry.purpose}</td>
                <td>
                  <span className={entry.status === 'Interface defined' ? 'badge badge-outline' : 'badge badge-warn'}>{entry.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="card">
        <div className="card-title">Why this is not wired up yet</div>
        <p className="card-body">
          Synchronised playback needs clock agreement and a trustworthy session owner before it is worth building; shipping a
          half-connected device screen would make the product look finished when it is not. The playback layer already isolates
          the engine behind <span className="mono">PlaybackBackend</span>, so a remote or follower backend can be added without
          rewriting the UI. Local playback is unaffected when sync does not exist.
        </p>
      </div>
    </div>
  )
}
