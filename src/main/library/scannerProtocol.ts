import type { ScanProgress, ScanSummary, Track } from '@core/models'
import type { KnownFile } from '../storage/libraryStore'

export interface ScanRequest {
  type: 'scan'
  folderId: string
  folderPath: string
  artworkDir: string
  known: KnownFile[]
  maxFiles?: number
}

export type ScannerInbound = ScanRequest | { type: 'cancel' }

export type ScannerOutbound =
  | { type: 'progress'; progress: ScanProgress }
  | { type: 'tracks'; tracks: Track[] }
  | { type: 'removed'; trackIds: string[] }
  | { type: 'done'; summary: ScanSummary }
  | { type: 'failed'; message: string }
