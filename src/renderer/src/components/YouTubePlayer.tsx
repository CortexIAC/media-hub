import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { formatYouTubeTime } from '@core/youtube'
import {
  describePlayerState,
  describeYouTubeError,
  loadYouTubeApi,
  type YouTubePlaybackState,
  type YouTubePlayerInstance
} from '../playback/youtubePlayer'
import { ExternalIcon, PauseIcon, PlayIcon, VolumeMuteIcon, VolumeIcon } from './Icons'

interface YouTubePlayerProps {
  videoId: string
  title: string
  onStateChange?: (state: YouTubePlaybackState) => void
  onEnded?: () => void
}

/**
 * The official YouTube embedded player, always visible.
 *
 * Controls here call the player's own API; nothing is drawn over the video and
 * the playsinline/controls parameters are left at YouTube's defaults so
 * attribution and ads behave as YouTube requires.
 */
export function YouTubePlayer({ videoId, title, onStateChange, onEnded }: YouTubePlayerProps): ReactElement {
  const holder = useRef<HTMLDivElement | null>(null)
  const player = useRef<YouTubePlayerInstance | null>(null)
  const [state, setState] = useState<YouTubePlaybackState>('unstarted')
  const [error, setError] = useState<string | null>(null)
  const [positionMs, setPositionMs] = useState(0)
  const [durationMs, setDurationMs] = useState(0)
  const [volume, setVolume] = useState(80)
  const [muted, setMuted] = useState(false)
  const [ready, setReady] = useState(false)

  const callbacks = useRef({ onStateChange, onEnded })
  callbacks.current = { onStateChange, onEnded }

  const publishState = useCallback((next: YouTubePlaybackState) => {
    setState(next)
    callbacks.current.onStateChange?.(next)
  }, [])

  useEffect(() => {
    if (!holder.current) return
    let disposed = false
    setError(null)
    setReady(false)

    void (async () => {
      try {
        const YT = await loadYouTubeApi()
        if (disposed || !holder.current) return
        player.current = new YT.Player(holder.current, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            controls: 1,
            rel: 0,
            playsinline: 1,
            modestbranding: 1,
            // Selecting a result is the user gesture; that click is what starts
            // playback, so the player does not sit cued waiting for a second one.
            autoplay: 1
          },
          events: {
            onReady: (event) => {
              if (disposed) return
              setReady(true)
              setDurationMs(event.target.getDuration() * 1000)
              setVolume(event.target.getVolume())
              publishState('cued')
              try {
                event.target.playVideo()
              } catch {
                // The player reports its own errors through onError.
              }
            },
            onStateChange: (event) => {
              if (disposed) return
              const next = describePlayerState(event.data)
              publishState(next)
              if (next === 'ended') callbacks.current.onEnded?.()
            },
            onError: (event) => {
              if (disposed) return
              setError(describeYouTubeError(event.data))
              publishState('error')
            }
          }
        })
      } catch (loadError) {
        if (!disposed) {
          setError(loadError instanceof Error ? loadError.message : String(loadError))
          publishState('error')
        }
      }
    })()

    return () => {
      disposed = true
      try {
        player.current?.destroy()
      } catch {
        // The iframe may already be gone.
      }
      player.current = null
    }
    // The player is created once; later video changes go through loadVideoById.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // YouTube's API terms forbid background playback: the player must stay
  // visible for the content to keep playing. Minimising the window pauses it
  // (the main process reports that; Chromium does not mark the page hidden for
  // a minimised Electron window), and so does the page going hidden.
  useEffect(() => {
    const pause = (): void => {
      try {
        player.current?.pauseVideo()
      } catch {
        // The iframe may already be gone.
      }
    }
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') pause()
    }
    const offWindowVisibility = window.bunny.app.onWindowVisibility((visible) => {
      if (!visible) pause()
    })
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      offWindowVisibility()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    const handle = window.setInterval(() => {
      const instance = player.current
      if (!instance) return
      try {
        setPositionMs(instance.getCurrentTime() * 1000)
        setDurationMs(instance.getDuration() * 1000)
      } catch {
        // Ignore reads during teardown.
      }
    }, 500)
    return () => window.clearInterval(handle)
  }, [ready])

  const previousId = useRef<string>(videoId)
  useEffect(() => {
    if (previousId.current === videoId) return
    previousId.current = videoId
    const instance = player.current
    if (!instance || !ready) return
    try {
      setError(null)
      instance.loadVideoById(videoId)
      publishState('buffering')
    } catch {
      setError('The player could not load that video.')
    }
  }, [videoId, ready, publishState])

  const toggle = (): void => {
    const instance = player.current
    if (!instance) return
    if (state === 'playing') instance.pauseVideo()
    else instance.playVideo()
  }

  const seek = (value: number): void => {
    const instance = player.current
    if (!instance || durationMs <= 0) return
    instance.seekTo(value / 1000, true)
    setPositionMs(value)
  }

  const changeVolume = (value: number): void => {
    player.current?.setVolume(value)
    setVolume(value)
    if (value > 0 && muted) setMuted(false)
  }

  const toggleMute = (): void => {
    const instance = player.current
    if (!instance) return
    if (muted) {
      instance.setVolume(volume || 80)
      setMuted(false)
    } else {
      instance.setVolume(0)
      setMuted(true)
    }
  }

  const progress = durationMs > 0 ? Math.min(100, (positionMs / durationMs) * 100) : 0

  return (
    <section className="yt-player" data-youtube-state={state} aria-label={`YouTube player: ${title}`}>
      <div className="yt-frame-wrap">
        <div className="yt-frame" ref={holder} data-video-id={videoId} />
        {!ready && !error ? (
          <div className="yt-overlay">
            <span className="spinner" />
            <span>Loading YouTube player…</span>
          </div>
        ) : null}
        {error ? (
          <div className="yt-overlay yt-overlay-error">
            <strong>This video can’t play here</strong>
            <span>{error}</span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void window.bunny.app.openExternal(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`)}
            >
              <ExternalIcon size={13} /> Open on YouTube
            </button>
          </div>
        ) : null}
      </div>

      <div className="yt-controls">
        <button type="button" className="btn-icon" aria-label={state === 'playing' ? 'Pause video' : 'Play video'} onClick={toggle}>
          {state === 'playing' ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
        </button>
        <span className="time tabular">{formatYouTubeTime(positionMs)}</span>
        <input
          type="range"
          className="rail"
          min={0}
          max={Math.max(durationMs, 1)}
          step={1000}
          value={positionMs}
          aria-label="Seek video"
          style={{ ['--fill' as string]: `${progress}%` } as CSSProperties}
          onChange={(event) => seek(Number(event.target.value))}
        />
        <span className="time tabular">{formatYouTubeTime(durationMs)}</span>
        <button type="button" className="btn-icon btn-icon-sm" aria-label={muted ? 'Unmute video' : 'Mute video'} onClick={toggleMute}>
          {muted ? <VolumeMuteIcon size={15} /> : <VolumeIcon size={15} />}
        </button>
        <input
          type="range"
          className="rail"
          min={0}
          max={100}
          step={1}
          value={muted ? 0 : volume}
          aria-label="Video volume"
          style={{ ['--fill' as string]: `${muted ? 0 : volume}%`, width: 90 } as React.CSSProperties}
          onChange={(event) => changeVolume(Number(event.target.value))}
        />
        <span className="badge">{state}</span>
      </div>
    </section>
  )
}
