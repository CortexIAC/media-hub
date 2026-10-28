import type { ReactElement } from 'react'
import { formatYouTubeTime, type YouTubeVideo } from '@core/youtube'
import { HeartIcon, PauseIcon, PlayIcon, PlusIcon, SkipForwardIcon } from './Icons'

interface YouTubeCardProps {
  video: YouTubeVideo
  favorite: boolean
  playing: boolean
  onPlay: () => void
  onPlayNext: () => void
  onEnqueue: () => void
  onToggleFavorite: () => void
}

/** One YouTube result. Used by the Video screen and by global search. */
export function YouTubeCard({
  video,
  favorite,
  playing,
  onPlay,
  onPlayNext,
  onEnqueue,
  onToggleFavorite
}: YouTubeCardProps): ReactElement {
  return (
    <article className={`yt-card ${playing ? 'is-playing' : ''}`}>
      <button
        type="button"
        className="yt-thumb"
        aria-label={`Play YouTube ${video.title}`}
        onClick={onPlay}
      >
        <img src={video.thumbnailUrl} alt="" loading="lazy" />
        <span className="yt-thumb-play">{playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}</span>
        {video.durationMs ? <span className="yt-thumb-time">{formatYouTubeTime(video.durationMs)}</span> : null}
      </button>
      <div className="yt-card-body">
        <div className="yt-card-title" title={video.title}>
          {video.title}
        </div>
        <div className="yt-card-sub">{video.channel ?? 'YouTube'}</div>
        <div className="yt-card-actions">
          <button type="button" className="btn btn-sm" onClick={onPlay}>
            <PlayIcon size={12} /> {playing ? 'Playing' : 'Play'}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" aria-label={`Play next: ${video.title}`} onClick={onPlayNext}>
            <SkipForwardIcon size={12} /> Next
          </button>
          <button type="button" className="btn btn-sm btn-ghost" aria-label={`Add to queue: ${video.title}`} onClick={onEnqueue}>
            <PlusIcon size={12} /> Queue
          </button>
          <button
            type="button"
            className={`btn btn-sm btn-ghost ${favorite ? 'is-active' : ''}`}
            aria-label={favorite ? `Remove ${video.title} from saved videos` : `Save ${video.title}`}
            aria-pressed={favorite}
            onClick={onToggleFavorite}
          >
            <HeartIcon size={12} filled={favorite} />
          </button>
        </div>
      </div>
    </article>
  )
}
