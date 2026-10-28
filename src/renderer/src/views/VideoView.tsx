import type { ReactElement } from 'react'
import { ProviderCard } from '../components/ProviderCard'
import { VideoIcon } from '../components/Icons'
import { useProviders } from '../state/meta'

export function VideoView(): ReactElement {
  const providers = useProviders()
  const videoProviders = providers.filter((provider) => provider.kind === 'video' || provider.kind === 'archive')

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-header-text">
          <span className="view-eyebrow">Planned · not in Sprint 1</span>
          <h1>Video</h1>
          <p className="view-subtitle">
            Movies, shows and archive film will live here. Sprint 1 deliberately ships music only: the player, library and
            persistence are finished, and video needs a visible embedded browser surface plus per-provider rules that have not
            been built yet.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <span className="empty-icon" style={{ flex: 'none' }}>
          <VideoIcon size={22} />
        </span>
        <div>
          <div className="card-title">What this screen will become</div>
          <p className="card-body">
            A video and film library with the same layout as Music: a catalog of titles, a detail page, a playback surface and a
            queue. Playback for third-party services must run inside the provider’s own player. Nothing here is wired up because
            an empty shell pretending to stream would be misleading.
          </p>
        </div>
      </div>

      <section className="section">
        <div className="section-header">
          <h2>Provider feasibility</h2>
          <span className="faint" style={{ fontSize: 12 }}>
            From the Sprint 1 provider research
          </span>
        </div>
        <div className="provider-list">
          {videoProviders.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} />
          ))}
        </div>
      </section>
    </div>
  )
}
