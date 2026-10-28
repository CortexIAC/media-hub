import { describe, expect, it } from 'vitest'
import type { YouTubeVideo } from '../../src/core/youtube'
import {
  afterYouTubeEnded,
  clearYouTubeQueue,
  EMPTY_YOUTUBE_QUEUE,
  enqueueYouTubeNext,
  enqueueYouTubeVideo,
  MAX_PLAYED,
  playYouTubeList,
  playYouTubeNext,
  playYouTubeNow,
  playYouTubePrevious,
  removeQueuedVideo,
  stopYouTubePlayback,
  type YouTubeQueueState
} from '../../src/core/youtubeQueue'

function video(id: string): YouTubeVideo {
  return {
    id,
    title: `Video ${id}`,
    channel: 'Channel',
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
    url: `https://www.youtube.com/watch?v=${id}`,
    durationMs: 120_000,
    description: null
  }
}

const a = video('aaaaaaaaaaa')
const b = video('bbbbbbbbbbb')
const c = video('ccccccccccc')
const d = video('ddddddddddd')

const ids = (videos: readonly YouTubeVideo[]): string[] => videos.map((entry) => entry.id)

describe('YouTube queue transitions', () => {
  it('starts empty and plays a video without queueing it', () => {
    const state = playYouTubeNow(EMPTY_YOUTUBE_QUEUE, a)
    expect(state.current?.id).toBe(a.id)
    expect(state.queue).toEqual([])
    expect(state.played).toEqual([])
  })

  it('keeps the previous video on the back-stack', () => {
    const first = playYouTubeNow(EMPTY_YOUTUBE_QUEUE, a)
    const second = playYouTubeNow(first, b)
    expect(second.current?.id).toBe(b.id)
    expect(ids(second.played)).toEqual([a.id])
  })

  it('does nothing when the same video is chosen again', () => {
    const first = playYouTubeNow(EMPTY_YOUTUBE_QUEUE, a)
    expect(playYouTubeNow(first, a)).toBe(first)
  })

  it('drops a queued copy when a video is played directly', () => {
    const state = enqueueYouTubeVideo(playYouTubeNow(EMPTY_YOUTUBE_QUEUE, a), b)
    const played = playYouTubeNow({ ...state, queue: [c, b] }, b)
    expect(played.current?.id).toBe(b.id)
    expect(ids(played.queue)).toEqual([c.id])
  })

  it('plays a list from an index and queues the rest', () => {
    const state = playYouTubeList(EMPTY_YOUTUBE_QUEUE, [a, b, c, d], 1)
    expect(state.current?.id).toBe(b.id)
    expect(ids(state.queue)).toEqual([c.id, d.id])
  })

  it('clamps an out-of-range list index instead of failing', () => {
    expect(playYouTubeList(EMPTY_YOUTUBE_QUEUE, [a, b], 9).current?.id).toBe(b.id)
    expect(playYouTubeList(EMPTY_YOUTUBE_QUEUE, [a, b], -3).current?.id).toBe(a.id)
    expect(playYouTubeList(EMPTY_YOUTUBE_QUEUE, [], 0)).toBe(EMPTY_YOUTUBE_QUEUE)
  })

  it('advances down the queue and back up it', () => {
    const started = playYouTubeList(EMPTY_YOUTUBE_QUEUE, [a, b, c], 0)
    const second = playYouTubeNext(started)
    expect(second.current?.id).toBe(b.id)
    expect(ids(second.queue)).toEqual([c.id])
    expect(ids(second.played)).toEqual([a.id])

    const back = playYouTubePrevious(second)
    expect(back.current?.id).toBe(a.id)
    expect(ids(back.queue)).toEqual([b.id, c.id])
    expect(back.played).toEqual([])
  })

  it('ignores next and previous when there is nothing to move to', () => {
    const single = playYouTubeNow(EMPTY_YOUTUBE_QUEUE, a)
    expect(playYouTubeNext(single)).toBe(single)
    expect(playYouTubePrevious(single)).toBe(single)
  })

  it('queues without duplicates and keeps order', () => {
    let state = playYouTubeNow(EMPTY_YOUTUBE_QUEUE, a)
    state = enqueueYouTubeVideo(state, b)
    state = enqueueYouTubeVideo(state, c)
    state = enqueueYouTubeVideo(state, b)
    expect(ids(state.queue)).toEqual([b.id, c.id])
  })

  it('does not queue the video that is already playing', () => {
    const state = playYouTubeNow(EMPTY_YOUTUBE_QUEUE, a)
    expect(enqueueYouTubeVideo(state, a)).toBe(state)
    expect(enqueueYouTubeNext(state, a)).toBe(state)
  })

  it('puts a "play next" video at the front of the queue', () => {
    let state = playYouTubeNow(EMPTY_YOUTUBE_QUEUE, a)
    state = enqueueYouTubeVideo(state, c)
    state = enqueueYouTubeNext(state, b)
    expect(ids(state.queue)).toEqual([b.id, c.id])
  })

  it('removes a queued video and leaves the rest alone', () => {
    let state = playYouTubeNow(EMPTY_YOUTUBE_QUEUE, a)
    state = enqueueYouTubeVideo(enqueueYouTubeVideo(state, b), c)
    const trimmed = removeQueuedVideo(state, b.id)
    expect(ids(trimmed.queue)).toEqual([c.id])
    expect(removeQueuedVideo(trimmed, 'zzzzzzzzzzz')).toEqual(trimmed)
  })

  it('clears the queue but keeps playing', () => {
    let state = playYouTubeNow(EMPTY_YOUTUBE_QUEUE, a)
    state = enqueueYouTubeVideo(state, b)
    const cleared = clearYouTubeQueue(state)
    expect(cleared.current?.id).toBe(a.id)
    expect(cleared.queue).toEqual([])
    expect(clearYouTubeQueue(cleared)).toBe(cleared)
  })

  it('stops playback without losing the queue', () => {
    let state = playYouTubeNow(EMPTY_YOUTUBE_QUEUE, a)
    state = enqueueYouTubeVideo(state, b)
    const stopped = stopYouTubePlayback(state)
    expect(stopped.current).toBeNull()
    expect(ids(stopped.queue)).toEqual([b.id])
    expect(stopYouTubePlayback(stopped)).toBe(stopped)
  })

  it('continues after a video ends only when something is queued', () => {
    const single = playYouTubeNow(EMPTY_YOUTUBE_QUEUE, a)
    expect(afterYouTubeEnded(single)).toBe(single)

    const queued = enqueueYouTubeVideo(single, b)
    const advanced = afterYouTubeEnded(queued)
    expect(advanced.current?.id).toBe(b.id)
    expect(advanced.queue).toEqual([])
  })

  it('bounds the back-stack so a long session cannot grow forever', () => {
    let state: YouTubeQueueState = EMPTY_YOUTUBE_QUEUE
    for (let index = 0; index < MAX_PLAYED + 10; index += 1) {
      const id = `video${String(index).padStart(6, '0')}`
      state = playYouTubeNow(state, video(id))
    }
    expect(state.played.length).toBe(MAX_PLAYED)
    // 60 videos played: the newest back-stack entry is the 59th, the oldest 50 back.
    expect(state.played[0]?.title).toBe('Video video000058')
  })

  it('never repeats a video in the back-stack', () => {
    let state = playYouTubeNow(EMPTY_YOUTUBE_QUEUE, a)
    state = playYouTubeNow(state, b)
    state = playYouTubeNow(state, a)
    // b is the most recent, a only appears once even though it was played twice.
    expect(ids(state.played)).toEqual([b.id, a.id])
  })
})
