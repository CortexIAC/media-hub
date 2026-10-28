import { useEffect, useRef, type ReactElement } from 'react'
import type { StreamSourceView } from '@shared/ipc'
import type { StreamPlaybackStatus } from '../state/streams'

interface StreamPlayerProps {
  source: StreamSourceView
  onStatus: (status: StreamPlaybackStatus) => void
  onError: (message: string | null) => void
}

interface HlsErrorPayload {
  fatal?: boolean
  type?: string
  details?: string
  reason?: string
  response?: { code?: number; text?: string }
}

/**
 * The playback element for a saved stream.
 *
 * Progressive links (MP4/WebM/MP3/AAC/FLAC…) go straight to the video element
 * through `bunny-stream:`. HLS goes through hls.js against the same proxy, which
 * is what makes `.m3u8` indexer/IPTV lists playable at all: Chromium has no
 * native HLS support. The worker is disabled deliberately — the app's content
 * security policy allows scripts only from 'self', and a blob worker would be
 * blocked silently.
 */
export function StreamPlayer({ source, onStatus, onError }: StreamPlayerProps): ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let disposed = false
    let destroyHls: (() => void) | null = null

    onError(null)
    onStatus('loading')

    const attemptPlay = (): void => {
      const started = video.play()
      // Autoplay can still be refused (a suspended document, a codec probe).
      // The native controls remain, so the user can press play instead of the
      // app reporting a failure that did not happen.
      if (started && typeof started.catch === 'function') started.catch(() => undefined)
    }

    if (source.kind === 'hls') {
      void import('hls.js')
        .then((module) => {
          if (disposed) return
          const Hls = module.default
          if (!Hls.isSupported()) {
            onError('This build cannot play HLS in-app. Open the stream in VLC instead.')
            onStatus('error')
            return
          }
          const instance = new Hls({ enableWorker: false, lowLatencyMode: true, backBufferLength: 60 })
          destroyHls = () => instance.destroy()
          instance.on(Hls.Events.ERROR, (_event, data: HlsErrorPayload) => {
            if (!data.fatal) return
            onError(describeHlsError(data))
            onStatus('error')
            instance.destroy()
          })
          instance.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!disposed) attemptPlay()
          })
          instance.loadSource(source.playUrl)
          instance.attachMedia(video)
        })
        .catch((cause: unknown) => {
          if (disposed) return
          onError(`The HLS player could not start: ${describe(cause)}`)
          onStatus('error')
        })
    } else {
      video.src = source.playUrl
      attemptPlay()
    }

    return () => {
      disposed = true
      destroyHls?.()
      video.removeAttribute('src')
      // Releases the decoder and any open socket for this stream.
      video.load()
    }
  }, [source.playUrl, source.kind, onError, onStatus])

  return (
    <video
      ref={videoRef}
      className="stream-video"
      controls
      playsInline
      crossOrigin="anonymous"
      preload="auto"
      aria-label={`Stream player: ${source.name}`}
      onPlaying={() => {
        onError(null)
        onStatus('playing')
      }}
      onPause={() => onStatus('paused')}
      onWaiting={() => onStatus('loading')}
      onEnded={() => onStatus('paused')}
      onError={() => {
        onError(describeMediaError(videoRef.current?.error))
        onStatus('error')
      }}
    />
  )
}

function describeHlsError(data: HlsErrorPayload): string {
  const status = data.response?.code
  if (status === 401 || status === 403) {
    return `The stream server refused the request (HTTP ${status}). The link may have expired or need a token.`
  }
  if (status === 404) return 'The playlist or one of its segments was not found (HTTP 404).'

  switch (data.details) {
    case 'manifestLoadError':
      return 'The playlist could not be loaded. Check the link, or open it in VLC.'
    case 'manifestParsingError':
      return 'That link is not a valid HLS playlist.'
    case 'levelLoadError':
      return 'A playlist variant could not be loaded.'
    case 'fragLoadError':
    case 'fragLoadTimeOut':
      return 'A segment of the stream could not be fetched. The source may be offline.'
    case 'fragParsingError':
    case 'bufferAppendError':
      return 'This stream uses an audio or video codec that cannot be decoded in-app. Try VLC.'
    case 'bufferStalledError':
      return 'The stream stalled while buffering. Try again, or open it in VLC.'
    default:
      return `HLS playback failed${data.details ? ` (${data.details})` : ''}. Try VLC if it keeps happening.`
  }
}

function describeMediaError(error: MediaError | null | undefined): string {
  if (!error) return 'This stream could not be played.'
  switch (error.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return 'Playback was aborted before the stream started.'
    case MediaError.MEDIA_ERR_NETWORK:
      return 'The stream dropped while loading. The source may be offline.'
    case MediaError.MEDIA_ERR_DECODE:
      return 'This stream could not be decoded (unsupported codec). Try VLC.'
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'This format is not supported in-app. Open it in VLC instead.'
    default:
      return 'This stream could not be played.'
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
