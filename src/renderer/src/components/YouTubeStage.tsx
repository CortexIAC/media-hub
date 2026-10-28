import type { ReactElement } from 'react'
import { useUi } from '../state/ui'
import { useYouTube } from '../state/youtube'
import { CloseIcon, ExternalIcon, MaximizeIcon, SkipForwardIcon } from './Icons'
import { YouTubePlayer } from './YouTubePlayer'

/**
 * The one YouTube player instance in the app.
 *
 * On the Video screen it is the large stage. Anywhere else it docks to the
 * bottom-right corner and keeps playing, so music can continue while browsing
 * the library, playlists or search. The element itself never unmounts when the
 * view changes — only its CSS box does — because remounting would tear down the
 * iframe and stop playback.
 *
 * It stays visible on purpose: YouTube's API terms forbid hidden or background
 * playback, so the player must remain on screen for the content to keep playing.
 */
export function YouTubeStage(): ReactElement | null {
  const ui = useUi()
  const youtube = useYouTube()
  const video = youtube.current

  if (!video) return null

  const docked = ui.route.name !== 'video'

  return (
    <section className={`yt-host ${docked ? 'is-dock' : 'is-stage'}`} aria-label={`YouTube player: ${video.title}`}>
      {docked ? (
        <div className="yt-dock-bar">
          <div className="yt-dock-text">
            <span className="yt-dock-eyebrow">YouTube</span>
            <span className="yt-dock-title" title={video.title}>
              {video.title}
            </span>
          </div>
          <div className="yt-dock-actions">
            <button
              type="button"
              className="btn-icon btn-icon-sm"
              aria-label="Open the full video player"
              title="Open the full video player"
              onClick={() => ui.navigate({ name: 'video' })}
            >
              <MaximizeIcon size={13} />
            </button>
            <button
              type="button"
              className="btn-icon btn-icon-sm"
              aria-label="Stop the video"
              title="Stop the video"
              onClick={youtube.stop}
            >
              <CloseIcon size={13} />
            </button>
          </div>
        </div>
      ) : null}

      <YouTubePlayer
        videoId={video.id}
        title={video.title}
        onStateChange={youtube.setPlayerState}
        onEnded={youtube.handleEnded}
      />

      {docked ? (
        <div className="yt-dock-footer">
          <span className="yt-dock-hint">{youtube.queue.length > 0 ? `${youtube.queue.length} queued` : 'Stays visible on this screen'}</span>
          <div className="row" style={{ gap: 4 }}>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={youtube.next}
              disabled={youtube.queue.length === 0}
              aria-label="Play the next queued video"
            >
              Next <SkipForwardIcon size={12} />
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              aria-label="Open this video on YouTube"
              onClick={() => void window.bunny.app.openExternal(video.url)}
            >
              <ExternalIcon size={12} />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
