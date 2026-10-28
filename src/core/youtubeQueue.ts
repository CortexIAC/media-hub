import type { YouTubeVideo } from './youtube'
import { uniqueVideos } from './youtube'

/**
 * YouTube queue transitions, kept pure so they can be tested without a player.
 *
 * `current` is what the embedded player is showing, `queue` is what plays next
 * (head first) and `played` is the back-stack for "previous". Everything is
 * keyed by the stable 11-character video id; no stream URLs are stored.
 */
export interface YouTubeQueueState {
  current: YouTubeVideo | null
  queue: YouTubeVideo[]
  played: YouTubeVideo[]
}

export const EMPTY_YOUTUBE_QUEUE: YouTubeQueueState = { current: null, queue: [], played: [] }

/** The back-stack is bounded so a long session cannot grow without limit. */
export const MAX_PLAYED = 50

function withoutId(videos: readonly YouTubeVideo[], id: string): YouTubeVideo[] {
  return videos.filter((video) => video.id !== id)
}

function pushPlayed(played: readonly YouTubeVideo[], video: YouTubeVideo | null): YouTubeVideo[] {
  if (!video) return [...played]
  return [video, ...withoutId(played, video.id)].slice(0, MAX_PLAYED)
}

/** Replaces the current video immediately. */
export function playYouTubeNow(state: YouTubeQueueState, video: YouTubeVideo): YouTubeQueueState {
  if (state.current?.id === video.id) return state
  return {
    current: video,
    queue: withoutId(state.queue, video.id),
    played: pushPlayed(state.played, state.current)
  }
}

/** Plays a list from an index, queueing everything after it. */
export function playYouTubeList(
  state: YouTubeQueueState,
  videos: readonly YouTubeVideo[],
  index = 0
): YouTubeQueueState {
  const list = uniqueVideos(videos)
  if (list.length === 0) return state
  const position = Math.max(0, Math.min(index, list.length - 1))
  const chosen = list[position]
  if (!chosen) return state
  const remaining = list.slice(position + 1)
  return {
    current: chosen,
    queue: remaining,
    played: pushPlayed(state.played, state.current)
  }
}

/** Moves to the head of the queue; the previous video goes on the back-stack. */
export function playYouTubeNext(state: YouTubeQueueState): YouTubeQueueState {
  const [head, ...rest] = state.queue
  if (!head) return state
  return { current: head, queue: rest, played: pushPlayed(state.played, state.current) }
}

/** Returns to the last played video, putting the current one back at the front. */
export function playYouTubePrevious(state: YouTubeQueueState): YouTubeQueueState {
  const [head, ...rest] = state.played
  if (!head) return state
  const queue = state.current ? [state.current, ...withoutId(state.queue, state.current.id)] : state.queue
  return { current: head, queue, played: rest }
}

/** Appends to the end of the queue. Already-queued videos are left where they are. */
export function enqueueYouTubeVideo(state: YouTubeQueueState, video: YouTubeVideo): YouTubeQueueState {
  if (state.current?.id === video.id) return state
  if (state.queue.some((queued) => queued.id === video.id)) return state
  return { ...state, queue: [...state.queue, video] }
}

/** Puts a video at the front of the queue ("play next"). */
export function enqueueYouTubeNext(state: YouTubeQueueState, video: YouTubeVideo): YouTubeQueueState {
  if (state.current?.id === video.id) return state
  return { ...state, queue: [video, ...withoutId(state.queue, video.id)] }
}

export function removeQueuedVideo(state: YouTubeQueueState, id: string): YouTubeQueueState {
  return { ...state, queue: withoutId(state.queue, id) }
}

export function clearYouTubeQueue(state: YouTubeQueueState): YouTubeQueueState {
  return state.queue.length === 0 ? state : { ...state, queue: [] }
}

/** Stops playback but keeps the queue so it can be resumed deliberately. */
export function stopYouTubePlayback(state: YouTubeQueueState): YouTubeQueueState {
  return state.current === null ? state : { ...state, current: null }
}

/**
 * What to do when the player reports ENDED: continue down the queue, or stop
 * where it is when there is nothing queued. Nothing is looped implicitly —
 * repeat is a queue decision, not a hidden player behaviour.
 */
export function afterYouTubeEnded(state: YouTubeQueueState): YouTubeQueueState {
  if (state.queue.length === 0) return state
  return playYouTubeNext(state)
}
