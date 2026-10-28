import { Worker } from 'node:worker_threads'
import type { ScanProgress, ScanSummary, Track } from '@core/models'
import type { ScanRequest, ScannerOutbound } from './scannerProtocol'

export interface ScannerServiceOptions {
  workerPath: string
  onProgress: (progress: ScanProgress | null) => void
  onTracks: (tracks: Track[]) => void
  onRemoved: (trackIds: string[]) => void
}

/**
 * Owns the scan worker. Only one scan runs at a time: a second request is
 * rejected rather than queueing, which prevents duplicate background scans.
 */
export class ScannerService {
  private readonly options: ScannerServiceOptions
  private worker: Worker | null = null
  private activeFolderId: string | null = null
  private cancelled = false
  private disposed = false

  constructor(options: ScannerServiceOptions) {
    this.options = options
  }

  get isScanning(): boolean {
    return this.worker !== null
  }

  get scanningFolderId(): string | null {
    return this.activeFolderId
  }

  scan(request: Omit<ScanRequest, 'type'>): Promise<ScanSummary> {
    if (this.disposed) return Promise.reject(new Error('Scanner has been disposed.'))
    if (this.worker) return Promise.reject(new Error('A library scan is already running. Wait for it to finish.'))

    this.cancelled = false
    this.activeFolderId = request.folderId

    const worker = new Worker(this.options.workerPath)
    this.worker = worker

    return new Promise<ScanSummary>((resolve, reject) => {
      let settled = false

      const finish = (summary: ScanSummary | null, error?: Error): void => {
        if (settled) return
        settled = true
        this.options.onProgress(null)
        this.cleanup(worker)
        if (error) reject(error)
        else if (summary) resolve(summary)
        else reject(new Error('Scan finished without a result.'))
      }

      worker.on('message', (message: ScannerOutbound) => {
        switch (message.type) {
          case 'progress':
            this.options.onProgress(message.progress)
            break
          case 'tracks':
            this.options.onTracks(message.tracks)
            break
          case 'removed':
            this.options.onRemoved(message.trackIds)
            break
          case 'done':
            finish(message.summary)
            break
          case 'failed':
            finish(null, new Error(message.message))
            break
        }
      })

      worker.on('error', (error) => finish(null, error instanceof Error ? error : new Error(String(error))))
      worker.on('exit', (code) => {
        if (!settled) finish(null, new Error(`Scan worker stopped unexpectedly (exit code ${code}).`))
      })

      worker.postMessage({ type: 'scan', ...request })
    })
  }

  cancel(): void {
    if (!this.worker) return
    this.cancelled = true
    this.worker.postMessage({ type: 'cancel' })
  }

  get wasCancelled(): boolean {
    return this.cancelled
  }

  dispose(): void {
    this.disposed = true
    if (this.worker) {
      this.worker.postMessage({ type: 'cancel' })
      void this.worker.terminate()
      this.worker = null
    }
    this.activeFolderId = null
  }

  private cleanup(worker: Worker): void {
    if (this.worker === worker) {
      this.worker = null
      this.activeFolderId = null
    }
    void worker.terminate()
  }
}
