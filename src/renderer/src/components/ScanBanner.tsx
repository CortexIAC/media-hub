import type { ReactElement } from 'react'
import { useData } from '../state/data'

export function ScanBanner(): ReactElement | null {
  const data = useData()
  const progress = data.scanning
  if (!progress) return null

  const folder = data.folders.find((entry) => entry.id === progress.folderId)
  const phaseLabel =
    progress.phase === 'walking'
      ? 'Looking for audio files'
      : progress.phase === 'reading'
        ? 'Reading metadata and artwork'
        : 'Finishing up'

  return (
    <div className="scan-banner" role="status">
      <span className="spinner" />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div>
          Scanning {folder?.name ?? 'folder'} — {phaseLabel}
        </div>
        <div className="scan-detail">
          {progress.filesSeen.toLocaleString()} files seen · {progress.tracksFound.toLocaleString()} tracks found
          {progress.currentFile ? ` · ${shortName(progress.currentFile)}` : ''}
        </div>
      </div>
      <div className="scan-bar" aria-hidden="true">
        <span />
      </div>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => void data.cancelScan()}>
        Cancel
      </button>
    </div>
  )
}

function shortName(filePath: string): string {
  const parts = filePath.split(/[\\/]/)
  return parts[parts.length - 1] ?? filePath
}
