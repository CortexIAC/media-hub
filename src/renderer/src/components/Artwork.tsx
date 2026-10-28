import { useEffect, useState, type ReactElement } from 'react'
import { DiscIcon } from './Icons'

interface ArtworkProps {
  artworkId: string | null
  seed: string
  className?: string
  iconSize?: number
}

/**
 * Cached artwork served by the bunny-media:// protocol. Uses native lazy
 * loading and async decode so a large grid does not hold every full-resolution
 * image in memory at once.
 */
export function Artwork({ artworkId, seed, className, iconSize = 26 }: ArtworkProps): ReactElement {
  const [failed, setFailed] = useState(false)
  const url = artworkId ? window.bunny.media.artworkUrl(artworkId) : null

  useEffect(() => {
    setFailed(false)
  }, [url])

  if (!url || failed) {
    return (
      <div className={className} style={{ height: '100%', width: '100%' }}>
        <ArtworkFallback seed={seed} iconSize={iconSize} />
      </div>
    )
  }

  return (
    <img
      className={className}
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}

export function ArtworkFallback({ seed, iconSize = 26 }: { seed: string; iconSize?: number }): ReactElement {
  const hue = hashHue(seed)
  return (
    <div
      className="art-fallback"
      style={{
        background: `linear-gradient(145deg, hsl(${hue} 26% 24%), hsl(${(hue + 42) % 360} 22% 11%))`
      }}
    >
      <DiscIcon size={iconSize} />
    </div>
  )
}

function hashHue(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 360
  }
  return hash
}
