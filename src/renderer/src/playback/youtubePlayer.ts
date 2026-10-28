/**
 * Loader and minimal typings for the official YouTube IFrame Player API.
 *
 * The player is the only playback path for YouTube content in this app: the
 * terms of service forbid extracting streams, so nothing here resolves media
 * URLs — the iframe does its own playback.
 */

export interface YouTubePlayerInstance {
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  setVolume(volume: number): void
  getVolume(): number
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  loadVideoById(videoId: string): void
  destroy(): void
}

export interface YouTubePlayerEvent {
  target: YouTubePlayerInstance
  data: number
}

export interface YouTubeNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId?: string
      width?: string | number
      height?: string | number
      playerVars?: Record<string, string | number>
      events?: {
        onReady?: (event: YouTubePlayerEvent) => void
        onStateChange?: (event: YouTubePlayerEvent) => void
        onPlaybackRateChange?: (event: YouTubePlayerEvent) => void
        onError?: (event: YouTubePlayerEvent) => void
      }
    }
  ) => YouTubePlayerInstance
  PlayerState: {
    UNSTARTED: number
    ENDED: number
    PLAYING: number
    PAUSED: number
    BUFFERING: number
    CUED: number
  }
}

declare global {
  interface Window {
    YT?: YouTubeNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let loader: Promise<YouTubeNamespace> | null = null

export function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (typeof window === 'undefined') return Promise.reject(new Error('The YouTube player needs a window.'))
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (loader) return loader

  loader = new Promise<YouTubeNamespace>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      loader = null
      reject(new Error('The YouTube player took too long to load. Check the connection and try again.'))
    }, 20_000)

    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      window.clearTimeout(timeout)
      if (window.YT?.Player) resolve(window.YT)
      else reject(new Error('The YouTube player script loaded without an API.'))
    }

    if (!document.querySelector('script[data-youtube-iframe-api]')) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      script.dataset.youtubeIframeApi = 'true'
      script.addEventListener('error', () => {
        window.clearTimeout(timeout)
        loader = null
        reject(new Error('The YouTube player script could not be loaded. Check the connection.'))
      })
      document.head.appendChild(script)
    }
  })

  return loader
}

export type YouTubePlaybackState = 'unstarted' | 'ended' | 'playing' | 'paused' | 'buffering' | 'cued' | 'error'

export function describePlayerState(code: number | undefined): YouTubePlaybackState {
  switch (code) {
    case -1:
      return 'unstarted'
    case 0:
      return 'ended'
    case 1:
      return 'playing'
    case 2:
      return 'paused'
    case 3:
      return 'buffering'
    case 5:
      return 'cued'
    default:
      return 'error'
  }
}

/** YouTube IFrame API error codes, in the player's own words. */
export function describeYouTubeError(code: number | undefined): string {
  switch (code) {
    case 2:
      return 'That video id is not valid.'
    case 5:
      return 'The video could not be played in the embedded HTML5 player.'
    case 100:
      return 'This video is private or has been removed.'
    case 101:
    case 150:
      return 'The owner does not allow this video to be played in an embedded player. Open it on YouTube instead.'
    case 153:
      return 'YouTube refused the embedded request because the referrer was missing.'
    default:
      return `YouTube reported a playback error${typeof code === 'number' ? ` (code ${code})` : ''}.`
  }
}
