import { describe, expect, it } from 'vitest'
import {
  advance,
  append,
  clear,
  createQueue,
  currentTrackId,
  hasNext,
  hasPrevious,
  insertNext,
  isEmpty,
  jumpTo,
  jumpToTrack,
  move,
  removeAt,
  removeTrack,
  retreat,
  setRepeat,
  setShuffle
} from '@core/queue'

describe('queue basics', () => {
  it('creates a queue and clamps the starting index', () => {
    const queue = createQueue(['a', 'b', 'c'], 99)
    expect(queue.ids).toEqual(['a', 'b', 'c'])
    expect(queue.index).toBe(2)
    expect(currentTrackId(queue)).toBe('c')
    expect(isEmpty(createQueue())).toBe(true)
    expect(currentTrackId(createQueue())).toBeNull()
  })

  it('filters empty ids', () => {
    expect(createQueue(['a', '', 'b']).ids).toEqual(['a', 'b'])
  })

  it('advances in order and stops at the end without repeat', () => {
    const first = createQueue(['a', 'b'])
    const step = advance(first)
    expect(step).toMatchObject({ kind: 'play', id: 'b' })
    if (step.kind !== 'play') throw new Error('expected play')
    expect(step.queue.index).toBe(1)
    expect(advance(step.queue)).toEqual({ kind: 'stop', queue: step.queue })
    expect(hasNext(first)).toBe(true)
    expect(hasNext(step.queue)).toBe(false)
  })

  it('wraps with repeat all and repeats one track with repeat one', () => {
    const end = jumpTo(createQueue(['a', 'b']), 1)
    const wrapped = advance(setRepeat(end, 'all'))
    expect(wrapped).toMatchObject({ kind: 'play', id: 'a', wrapped: true })

    const one = advance(setRepeat(end, 'one'))
    expect(one).toMatchObject({ kind: 'play', id: 'b' })
    if (one.kind !== 'play') throw new Error('expected play')
    expect(one.queue.index).toBe(1)

    const manual = advance(setRepeat(end, 'one'), { ignoreRepeatOne: true })
    expect(manual).toMatchObject({ kind: 'play', id: 'a', wrapped: true })
  })

  it('retreats, restarts at the beginning, and wraps with repeat all', () => {
    const atSecond = jumpTo(createQueue(['a', 'b', 'c']), 1)
    expect(retreat(atSecond)).toMatchObject({ kind: 'play', id: 'a' })

    const atStart = createQueue(['a', 'b'])
    expect(retreat(atStart)).toMatchObject({ kind: 'play', id: 'a' })
    expect(hasPrevious(atStart)).toBe(false)

    const wrapped = retreat(setRepeat(atStart, 'all'))
    expect(wrapped).toMatchObject({ kind: 'play', id: 'b', wrapped: true })
  })

  it('stops advancing on an empty queue', () => {
    expect(advance(createQueue())).toEqual({ kind: 'stop', queue: createQueue() })
    expect(retreat(createQueue()).kind).toBe('stop')
  })

  it('jumps to an index or a track id', () => {
    const queue = createQueue(['a', 'b', 'c'])
    expect(jumpTo(queue, 99).index).toBe(2)
    expect(jumpTo(queue, -5).index).toBe(0)
    expect(currentTrackId(jumpToTrack(queue, 'b'))).toBe('b')
    expect(jumpToTrack(queue, 'zzz')).toBe(queue)
  })
})

describe('queue mutations', () => {
  it('inserts after the current track and can start playback', () => {
    const queue = createQueue(['a', 'b', 'c'], 1)
    expect(insertNext(queue, ['x', 'y']).ids).toEqual(['a', 'b', 'x', 'y', 'c'])
    expect(insertNext(queue, ['x']).index).toBe(1)
    expect(insertNext(queue, ['x'], true).index).toBe(2)
    expect(insertNext(createQueue(), ['x']).ids).toEqual(['x'])
    expect(insertNext(queue, [])).toBe(queue)
  })

  it('appends and starts an empty queue at the first new track', () => {
    const empty = createQueue()
    const filled = append(empty, ['a', 'b'])
    expect(filled.ids).toEqual(['a', 'b'])
    expect(filled.index).toBe(0)

    const queue = jumpTo(createQueue(['a']), 0)
    expect(append(queue, ['b']).index).toBe(0)
    expect(append(queue, []).ids).toEqual(['a'])
  })

  it('keeps the cursor on the same track when removing earlier items', () => {
    const queue = jumpTo(createQueue(['a', 'b', 'c']), 1)
    const after = removeAt(queue, 0)
    expect(after.ids).toEqual(['b', 'c'])
    expect(currentTrackId(after)).toBe('b')
  })

  it('moves the cursor to the next track when the current one is removed', () => {
    const queue = jumpTo(createQueue(['a', 'b', 'c']), 1)
    const after = removeAt(queue, 1)
    expect(after.ids).toEqual(['a', 'c'])
    expect(currentTrackId(after)).toBe('c')
  })

  it('falls back to the previous track when the last current item is removed', () => {
    const queue = jumpTo(createQueue(['a', 'b', 'c']), 2)
    const after = removeAt(queue, 2)
    expect(after.index).toBe(1)
    expect(currentTrackId(after)).toBe('b')
  })

  it('handles removing the last remaining track and out-of-range indexes', () => {
    const single = createQueue(['a'])
    const empty = removeAt(single, 0)
    expect(empty.ids).toEqual([])
    expect(currentTrackId(empty)).toBeNull()
    expect(removeAt(single, 5)).toBe(single)
  })

  it('removes every occurrence of a duplicated track id', () => {
    const queue = createQueue(['a', 'b', 'a', 'c'])
    const after = removeTrack(queue, 'a')
    expect(after.ids).toEqual(['b', 'c'])
  })

  it('reorders items and keeps the current track selected', () => {
    const queue = createQueue(['a', 'b', 'c'], 0)
    const moved = move(queue, 0, 2)
    expect(moved.ids).toEqual(['b', 'c', 'a'])
    expect(currentTrackId(moved)).toBe('a')

    const other = jumpTo(createQueue(['a', 'b', 'c']), 1)
    const movedOther = move(other, 2, 0)
    expect(movedOther.ids).toEqual(['c', 'a', 'b'])
    // The current track (b) follows its item to the end of the list.
    expect(currentTrackId(movedOther)).toBe('b')

    expect(move(queue, 1, 1)).toBe(queue)
    expect(move(queue, 9, 0)).toBe(queue)
  })

  it('clears the queue', () => {
    expect(clear(createQueue(['a', 'b'])).ids).toEqual([])
  })
})

describe('shuffle', () => {
  const zeroRandom = (): number => 0

  it('keeps the current track in place and preserves the original order', () => {
    const queue = jumpTo(createQueue(['a', 'b', 'c', 'd', 'e']), 2)
    const shuffled = setShuffle(queue, true, zeroRandom)
    expect(shuffled.shuffle).toBe(true)
    expect(currentTrackId(shuffled)).toBe('c')
    expect(shuffled.ids).toHaveLength(5)
    expect([...shuffled.ids].sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(shuffled.originalIds).toEqual(['a', 'b', 'c', 'd', 'e'])

    const restored = setShuffle(shuffled, false)
    expect(restored.ids).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(currentTrackId(restored)).toBe('c')
    expect(restored.shuffle).toBe(false)
    expect(restored.originalIds).toBeNull()
  })

  it('is a no-op when toggled to its current value', () => {
    const queue = createQueue(['a', 'b'])
    expect(setShuffle(queue, false)).toBe(queue)
  })

  it('restores the original order even after the current track moved', () => {
    let queue = jumpTo(createQueue(['a', 'b', 'c', 'd']), 0)
    queue = setShuffle(queue, true, zeroRandom)
    queue = jumpTo(queue, 2)
    const current = currentTrackId(queue)
    const restored = setShuffle(queue, false)
    expect(currentTrackId(restored)).toBe(current)
    expect(restored.ids).toEqual(['a', 'b', 'c', 'd'])
  })

  it('drops removed tracks from the saved original order', () => {
    let queue = jumpTo(createQueue(['a', 'b', 'c', 'd']), 0)
    queue = setShuffle(queue, true, zeroRandom)
    const target = queue.ids[3] as string
    queue = removeTrack(queue, target)
    expect(queue.originalIds).not.toContain(target)
    expect(setShuffle(queue, false).ids).toEqual(['a', 'b', 'c', 'd'].filter((id) => id !== target))
  })

  it('handles shuffling an empty queue', () => {
    const empty = setShuffle(createQueue(), true)
    expect(empty.shuffle).toBe(true)
    expect(setShuffle(empty, false).ids).toEqual([])
  })
})
