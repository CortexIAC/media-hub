import type { ReactElement } from 'react'
import type { Capability, CapabilityKey, ProviderDescriptor, ProviderStatus } from '@core/providers'
import { ExternalIcon } from './Icons'

const STATUS: Record<ProviderStatus, { label: string; className: string }> = {
  available: { label: 'Available', className: 'badge badge-accent' },
  'requires-configuration': { label: 'Needs an API key', className: 'badge badge-warn' },
  'requires-auth': { label: 'Needs authorization', className: 'badge badge-warn' },
  'requires-subscription': { label: 'Needs a subscription', className: 'badge badge-warn' },
  planned: { label: 'Planned', className: 'badge badge-outline' },
  'not-permitted': { label: 'Not permitted', className: 'badge badge-danger' },
  unavailable: { label: 'Unavailable', className: 'badge' }
}

const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  search: 'Search',
  browse: 'Browse',
  playback: 'Playback',
  'embedded-playback': 'Embedded playback',
  'background-playback': 'Background playback',
  'full-track-streaming': 'Full-track streaming',
  'playlist-import': 'Playlist import',
  'library-sync': 'Library sync',
  downloads: 'Downloads',
  'device-sync': 'Device sync'
}

export function ProviderCard({ provider }: { provider: ProviderDescriptor }): ReactElement {
  const status = STATUS[provider.status]
  const capabilities = Object.entries(provider.capabilities).filter((entry): entry is [CapabilityKey, Capability] =>
    Boolean(entry[1])
  )

  return (
    <article className="provider-card">
      <div className="provider-head">
        <h3>{provider.name}</h3>
        <span className={status.className}>{status.label}</span>
        {provider.integrated ? <span className="badge badge-accent">Integrated in Sprint 1</span> : <span className="badge badge-outline">Not implemented</span>}
      </div>
      <p className="provider-summary">{provider.summary}</p>
      <p className="provider-reason">{provider.statusReason}</p>

      <div className="capability-grid">
        {capabilities.map(([key, capability]) => (
          <div className="capability" key={key}>
            <span className={`capability-dot ${capability.supported ? 'ok' : 'no'}`} />
            <span>
              <strong style={{ color: 'var(--text-dim)', fontWeight: 550 }}>{CAPABILITY_LABELS[key] ?? key}</strong> — {capability.note}
            </span>
          </div>
        ))}
      </div>

      {provider.requirements.length > 0 ? (
        <p className="faint" style={{ fontSize: 11.5 }}>
          Requires: {provider.requirements.join(' · ')}
        </p>
      ) : null}

      {provider.documentationUrl ? (
        <div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void window.bunny.app.openExternal(provider.documentationUrl ?? '')}
          >
            <ExternalIcon size={13} /> Read the provider rules
          </button>
        </div>
      ) : null}
    </article>
  )
}
