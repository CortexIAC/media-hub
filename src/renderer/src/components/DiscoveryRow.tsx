import type { ReactElement } from 'react'
import { sourceLabel, type DiscoveryResult } from '@core/discovery'
import { BookIcon, ExternalIcon, MusicIcon, VideoIcon, VolumeIcon } from './Icons'

/**
 * One catalogue result. Kept in one place so global search and the Virtual
 * Library render identical rows and identical access wording.
 */
export function DiscoveryRow({ result }: { result: DiscoveryResult }): ReactElement {
  const accessUrl = result.accessUrl ?? result.detailUrl
  const showDetails = Boolean(result.accessUrl) && result.detailUrl !== result.accessUrl

  return (
    <div className="discovery-row">
      <span className="discovery-glyph" aria-hidden="true">
        <KindIcon kind={result.kind} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="discovery-title">{result.title}</div>
        <div className="discovery-meta">
          {[sourceLabel(result.source), result.creator, result.year ? String(result.year) : null].filter(Boolean).join(' · ')}
          {result.description ? ` — ${result.description}` : ''}
        </div>
      </div>
      <div className="discovery-badges">
        <span className="badge">{result.kind}</span>
        <button type="button" className="btn btn-sm" onClick={() => void window.bunny.app.openExternal(accessUrl)}>
          {result.accessLabel}
        </button>
        {showDetails ? (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            aria-label={`Open the catalogue page for ${result.title}`}
            onClick={() => void window.bunny.app.openExternal(result.detailUrl)}
          >
            <ExternalIcon size={13} />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function KindIcon({ kind }: { kind: DiscoveryResult['kind'] }): ReactElement {
  switch (kind) {
    case 'book':
      return <BookIcon size={16} />
    case 'audiobook':
      return <VolumeIcon size={16} />
    case 'video':
      return <VideoIcon size={16} />
    default:
      return <MusicIcon size={16} />
  }
}
