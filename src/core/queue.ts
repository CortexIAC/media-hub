import type { RepeatMode } from './models'

/**
 * Pure queue/transport-sequencing logic.
 *
 * The queue is an ordered list of track ids plus a cursor. Shuffle works by
 * permuting that list and remembering the original order, which keeps
 * next/previous/remove behaviour identical in both modes and makes the whole
 * thing trivially testable.
 */
export interface QueueState {
  ids: string[]
  index: number
  shuffle: boolean
  repeat: RepeatMode
  /** Original order, only set while shuffle is enabled. */
  originalIds: string[] | null
}

export type QueueAdvance =
  | { kind: 'play'; id: string; queue: QueueState; wrapped: boolean }
  | { kind: 'stop'; queue: QueueState }

export function createQueue(ids: string[] = [], startIndex = 0, repeat: RepeatMode = 'off'): QueueState {
  const clean = ids.filter((id) => typeof id === 'string' && id.length > 0)
  const index = clean.length === 0 ? 0 : clamp(startIndex, 0, clean.length - 1)
  return { ids: clean, index, shuffle: false, repeat, originalIds: null }
}

export function currentTrackId(queue: QueueState): string | null {
  return queue.ids[queue.index] ?? null
}

export function isEmpty(queue: QueueState): boolean {
  return queue.ids.length === 0
}

export function hasNext(queue: QueueState): boolean {
  if (queue.ids.length === 0) return false
  if (queue.repeat === 'all' || queue.repeat === 'one') return true
  return queue.index < queue.ids.length - 1
}

export function hasPrevious(queue: QueueState): boolean {
  if (queue.ids.length === 0) return false
  if (queue.repeat === 'all') return true
  return queue.index > 0
}

/**
 * Advance the cursor and report what the playback layer should do next.
 * `ignoreRepeatOne` is used for explicit user skips, where repeat-one must not
 * trap playback on the same track.
 */
export function advance(queue: QueueState, options: { ignoreRepeatOne?: boolean } = {}): QueueAdvance {
  if (queue.ids.length === 0) return { kind: 'stop', queue }

  const current = currentTrackId(queue)
  if (queue.repeat === 'one' && current && !options.ignoreRepeatOne) {
    return { kind: 'play', id: current, queue, wrapped: false }
  }

  if (queue.index < queue.ids.length - 1) {
    const next = { ...queue, index: queue.index + 1 }
    return { kind: 'play', id: next.ids[next.index] as string, queue: next, wrapped: false }
  }

  // A manual skip with repeat-one behaves like repeat-all: repeat is on, so
  // wrap rather than stopping at the end of the list.
  if (queue.repeat === 'all' || (options.ignoreRepeatOne && queue.repeat === 'one')) {
    const wrapped = { ...queue, index: 0 }
    return { kind: 'play', id: wrapped.ids[0] as string, queue: wrapped, wrapped: true }
  }

  return { kind: 'stop', queue }
}

/** Move one track backwards. At the start, repeat-all wraps to the end. */
export function retreat(queue: QueueState): QueueAdvance {
  if (queue.ids.length === 0) return { kind: 'stop', queue }
  if (queue.index > 0) {
    const prev = { ...queue, index: queue.index - 1 }
    return { kind: 'play', id: prev.ids[prev.index] as string, queue: prev, wrapped: false }
  }
  if (queue.repeat === 'all') {
    const wrapped = { ...queue, index: queue.ids.length - 1 }
    return { kind: 'play', id: wrapped.ids[wrapped.index] as string, queue: wrapped, wrapped: true }
  }
  const current = currentTrackId(queue)
  return current ? { kind: 'play', id: current, queue, wrapped: false } : { kind: 'stop', queue }
}

export function jumpTo(queue: QueueState, index: number): QueueState {
  if (queue.ids.length === 0) return queue
  return { ...queue, index: clamp(index, 0, queue.ids.length - 1) }
}

export function jumpToTrack(queue: QueueState, trackId: string): QueueState {
  const index = queue.ids.indexOf(trackId)
  return index === -1 ? queue : { ...queue, index }
}

/** Insert directly after the current track. Returns the queue and the new cursor. */
export function insertNext(queue: QueueState, ids: string[], playNow = false): QueueState {
  const insert = ids.filter((id) => typeof id === 'string' && id.length > 0)
  if (insert.length === 0) return queue
  if (queue.ids.length === 0) {
    return { ...queue, ids: insert, index: 0, originalIds: null }
  }
  const at = queue.index + 1
  const combined = [...queue.ids.slice(0, at), ...insert, ...queue.ids.slice(at)]
  const original = queue.originalIds
    ? insertIntoOriginal(queue, insert, at)
    : null
  return {
    ...queue,
    ids: combined,
    index: playNow ? at : queue.index,
    originalIds: original
  }
}

function insertIntoOriginal(queue: QueueState, ids: string[], afterIndex: number): string[] | null {
  const original = queue.originalIds
  if (!original) return null
  const anchor = queue.ids[afterIndex - 1]
  const anchorIndex = anchor ? original.indexOf(anchor) : -1
  const at = anchorIndex === -1 ? original.length : anchorIndex + 1
  return [...original.slice(0, at), ...ids, ...original.slice(at)]
}

export function append(queue: QueueState, ids: string[]): QueueState {
  const clean = ids.filter((id) => typeof id === 'string' && id.length > 0)
  if (clean.length === 0) return queue
  const wasEmpty = queue.ids.length === 0
  return {
    ...queue,
    ids: [...queue.ids, ...clean],
    index: wasEmpty ? 0 : queue.index,
    originalIds: queue.originalIds ? [...queue.originalIds, ...clean] : null
  }
}

export function removeAt(queue: QueueState, index: number): QueueState {
  if (index < 0 || index >= queue.ids.length) return queue
  const removed = queue.ids[index] as string
  const ids = queue.ids.filter((_, i) => i !== index)
  const originalIds = queue.originalIds ? queue.originalIds.filter((id) => id !== removed) : null
  let nextIndex = queue.index
  if (index < queue.index) nextIndex = queue.index - 1
  if (nextIndex > ids.length - 1) nextIndex = Math.max(0, ids.length - 1)
  return { ...queue, ids, index: nextIndex, originalIds }
}

export function removeTrack(queue: QueueState, trackId: string): QueueState {
  let result = queue
  for (let i = result.ids.length - 1; i >= 0; i -= 1) {
    if (result.ids[i] === trackId) result = removeAt(result, i)
  }
  return result
}

export function clear(queue: QueueState): QueueState {
  return { ...queue, ids: [], index: 0, originalIds: null }
}

export function move(queue: QueueState, from: number, to: number): QueueState {
  if (from === to) return queue
  if (from < 0 || from >= queue.ids.length) return queue
  const target = clamp(to, 0, queue.ids.length - 1)
  const ids = [...queue.ids]
  const [moved] = ids.splice(from, 1)
  if (moved === undefined) return queue
  ids.splice(target, 0, moved)

  let index = queue.index
  if (queue.index === from) index = target
  else if (from < queue.index && target >= queue.index) index = queue.index - 1
  else if (from > queue.index && target <= queue.index) index = queue.index + 1

  return { ...queue, ids, index }
}

export function setRepeat(queue: QueueState, repeat: RepeatMode): QueueState {
  return { ...queue, repeat }
}

/**
 * Toggle shuffle. When enabling, the current track stays put and every other
 * track is permuted around it. When disabling, the original order is restored
 * with the cursor following the current track.
 */
export function setShuffle(queue: QueueState, enabled: boolean, random: () => number = Math.random): QueueState {
  if (enabled === queue.shuffle) return queue
  if (!enabled) {
    const original = queue.originalIds
    if (!original) return { ...queue, shuffle: false }
    const current = currentTrackId(queue)
    const index = current ? Math.max(0, original.indexOf(current)) : 0
    return { ids: original, index, shuffle: false, repeat: queue.repeat, originalIds: null }
  }

  if (queue.ids.length === 0) {
    return { ...queue, shuffle: true, originalIds: queue.ids }
  }

  const current = currentTrackId(queue)
  const before = queue.ids.slice(0, queue.index)
  const after = queue.ids.slice(queue.index + 1)
  const ids = [...shuffleArray(before, random), ...(current ? [current] : []), ...shuffleArray(after, random)]
  return {
    ids,
    index: current ? before.length : 0,
    shuffle: true,
    repeat: queue.repeat,
    originalIds: queue.ids
  }
}

export function shuffleArray<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const a = result[i] as T
    const b = result[j] as T
    result[i] = b
    result[j] = a
  }
  return result
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.trunc(value)))
}
