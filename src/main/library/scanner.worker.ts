import { parentPort } from 'node:worker_threads'
import type { ScanProgress, ScanSummary, Track } from '@core/models'
import { normalizePathKey } from '../storage/paths'
import type { KnownFile } from '../storage/libraryStore'
import { readTrack, walkAudioFolder } from './scanner.core'
import type { ScanRequest, ScannerInbound, ScannerOutbound } from './scannerProtocol'

/**
 * Library scan worker. Runs off the main thread so window, IPC and menus stay
 * responsive while metadata is parsed.
 */

const port = parentPort
if (!port) throw new Error('scanner.worker must run inside a worker thread')

let cancelled = false
let running = false
let lastProgressAt = 0

port.on('message', (message: ScannerInbound) => {
  if (message.type === 'cancel') {
    cancelled = true
    return
  }
  if (message.type === 'scan') {
    if (running) {
      send({ type: 'failed', message: 'A scan is already running in this worker.' })
      return
    }
    void runScan(message)
  }
})

async function runScan(request: ScanRequest): Promise<void> {
  running = true
  cancelled = false
  const startedAt = Date.now()
  const knownByPath = new Map<string, KnownFile>()
  for (const entry of request.known) knownByPath.set(normalizePathKey(entry.path), entry)

  const summary: ScanSummary = {
    folderId: request.folderId,
    folderPath: request.folderPath,
    startedAt,
    finishedAt: 0,
    filesSeen: 0,
    tracksAdded: 0,
    tracksUpdated: 0,
    tracksUnchanged: 0,
    tracksRemoved: 0,
    failures: [],
    skipped: [],
    cancelled: false,
    truncated: false
  }

  const seenTrackIds = new Set<string>()
  let batch: Track[] = []
  let batchTimer = Date.now()

  const flushBatch = (): void => {
    if (batch.length === 0) return
    send({ type: 'tracks', tracks: batch })
    batch = []
    batchTimer = Date.now()
  }

  try {
    const walk = await walkAudioFolder(request.folderPath, {
      maxFiles: request.maxFiles,
      isCancelled: () => cancelled,
      onProgress: (filesSeen, currentFile) => {
        summary.filesSeen = filesSeen
        emitProgress({
          folderId: request.folderId,
          folderPath: request.folderPath,
          phase: 'walking',
          filesSeen,
          tracksFound: summary.tracksAdded + summary.tracksUpdated,
          currentFile,
          startedAt
        })
      }
    })

    summary.skipped = walk.skipped
    summary.failures.push(...walk.failures)
    summary.truncated = walk.truncated

    if (!walk.cancelled) {
      for (const file of walk.files) {
        if (cancelled) break
        const key = normalizePathKey(file.path)
        const known = knownByPath.get(key)

        if (known && Math.trunc(known.mtimeMs) === Math.trunc(file.mtimeMs) && known.fileSize === file.fileSize) {
          seenTrackIds.add(known.id)
          summary.tracksUnchanged += 1
          emitProgress({
            folderId: request.folderId,
            folderPath: request.folderPath,
            phase: 'reading',
            filesSeen: summary.filesSeen,
            tracksFound: summary.tracksAdded + summary.tracksUpdated,
            currentFile: file.path,
            startedAt
          })
          continue
        }

        const result = await readTrack(file, {
          folderId: request.folderId,
          artworkDir: request.artworkDir
        })
        seenTrackIds.add(result.track.id)
        if (result.failure) {
          if (summary.failures.length < 200) summary.failures.push(result.failure)
        }
        if (known) summary.tracksUpdated += 1
        else summary.tracksAdded += 1
        batch.push(result.track)

        if (batch.length >= 15 || Date.now() - batchTimer > 300) flushBatch()
        emitProgress({
          folderId: request.folderId,
          folderPath: request.folderPath,
          phase: 'reading',
          filesSeen: summary.filesSeen,
          tracksFound: summary.tracksAdded + summary.tracksUpdated,
          currentFile: file.path,
          startedAt
        })
      }
    }

    flushBatch()

    summary.cancelled = cancelled || walk.cancelled

    if (!summary.cancelled) {
      const removedIds = request.known.filter((entry) => !seenTrackIds.has(entry.id)).map((entry) => entry.id)
      summary.tracksRemoved = removedIds.length
      if (removedIds.length > 0) send({ type: 'removed', trackIds: removedIds })
    }

    summary.finishedAt = Date.now()
    send({ type: 'done', summary })
  } catch (error) {
    send({ type: 'failed', message: error instanceof Error ? error.message : String(error) })
    summary.finishedAt = Date.now()
    send({ type: 'done', summary: { ...summary, cancelled: true } })
  } finally {
    running = false
  }
}

function emitProgress(progress: ScanProgress): void {
  const now = Date.now()
  if (now - lastProgressAt < 120) return
  lastProgressAt = now
  send({ type: 'progress', progress })
}

function send(message: ScannerOutbound): void {
  port?.postMessage(message)
}
