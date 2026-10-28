import type { ReactElement } from 'react'
import { ProviderCard } from '../components/ProviderCard'
import { StreamsIcon } from '../components/Icons'
import { useProviders } from '../state/meta'

export function StreamsView(): ReactElement {
  const providers = useProviders()

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-header-text">
          <span className="view-eyebrow">Planned · not in Sprint 1</span>
          <h1>Streams</h1>
          <p className="view-subtitle">
            Authorized streaming services and network sources. Each provider below records what its platform actually permits —
            including the cases where a feature cannot be offered at all. No remote content is fetched by this build.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <span className="empty-icon" style={{ flex: 'none' }}>
          <StreamsIcon size={22} />
        </span>
        <div>
          <div className="card-title">Local playback never depends on this screen</div>
          <p className="card-body">
            If every provider is unreachable, absent or unlicensed, the local library keeps playing. Remote providers will be
            added behind the <span className="mono">RemoteProvider</span> contract, with their own authentication and capability
            reporting, so an integration can be switched off without touching the player.
          </p>
        </div>
      </div>

      <section className="section">
        <div className="section-header">
          <h2>Providers</h2>
        </div>
        <div className="provider-list">
          {providers.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
      </section>
    </div>
  )
}
