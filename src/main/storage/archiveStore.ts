import { sanitizeArchiveRecord, type ArchiveItemRecord } from '@core/archive'
import { JsonFile } from './jsonFile'

/**
 * Saved Internet Archive shows and movies, plus user-attached subtitle files.
 *
 * Only stable fields are stored: identifiers, metadata and file URLs. Playback
 * URLs are derived on read, so a saved show keeps working across restarts with
 * no stale tokens. Attachments are keyed by item + episode index because an
 * episode has no id of its own.
 */
export interface ArchiveAttachment {
  path: string
  name: string
  addedAt: number
}

export interface ArchiveSavedEntry {
  item: ArchiveItemRecord
  savedAt: number
  lastPlayedAt: number | null
  lastEpisodeIndex: number | null
}

export interface ArchiveStoreState {
  entries: ArchiveSavedEntry[]
  attachments: Record<string, ArchiveAttachment>
}

export function attachmentKey(identifier: string, episodeIndex: number): string {
  return `${identifier}#${episodeIndex}`
}

export class ArchiveStore {
  private readonly file: JsonFile<ArchiveStoreState>

  constructor(filePath: string) {
    this.file = new JsonFile<ArchiveStoreState>(
      filePath,
      () => ({ entries: [], attachments: {} }),
      sanitize
    )
  }

  async load(): Promise<void> {
    await this.file.load()
  }

  get entries(): ArchiveSavedEntry[] {
    return [...this.file.data.entries]
  }

  get(identifier: string): ArchiveSavedEntry | null {
    return this.file.data.entries.find((entry) => entry.item.identifier === identifier) ?? null
  }

  isSaved(identifier: string): boolean {
    return this.file.data.entries.some((entry) => entry.item.identifier === identifier)
  }

  save(item: ArchiveItemRecord, now = Date.now()): ArchiveSavedEntry | null {
    const clean = sanitizeArchiveRecord(item)
    if (!clean) return null
    const existing = this.get(clean.identifier)
    const entry: ArchiveSavedEntry = {
      item: clean,
      savedAt: existing?.savedAt ?? now,
      lastPlayedAt: existing?.lastPlayedAt ?? null,
      lastEpisodeIndex: existing?.lastEpisodeIndex ?? null
    }
    this.file.update((value) => {
      value.entries = [entry, ...value.entries.filter((candidate) => candidate.item.identifier !== clean.identifier)]
    })
    return entry
  }

  remove(identifier: string): boolean {
    const before = this.file.data.entries.length
    this.file.update((value) => {
      value.entries = value.entries.filter((entry) => entry.item.identifier !== identifier)
      for (const key of Object.keys(value.attachments)) {
        if (key.startsWith(`${identifier}#`)) delete value.attachments[key]
      }
    })
    return this.file.data.entries.length !== before
  }

  markPlayed(identifier: string, episodeIndex: number, now = Date.now()): void {
    if (!this.file.data.entries.some((entry) => entry.item.identifier === identifier)) return
    this.file.update((value) => {
      value.entries = value.entries.map((entry) =>
        entry.item.identifier === identifier
          ? { ...entry, lastPlayedAt: now, lastEpisodeIndex: episodeIndex }
          : entry
      )
    })
  }

  attachment(identifier: string, episodeIndex: number): ArchiveAttachment | null {
    return this.file.data.attachments[attachmentKey(identifier, episodeIndex)] ?? null
  }

  attach(identifier: string, episodeIndex: number, path: string, name: string, now = Date.now()): ArchiveAttachment {
    const attachment: ArchiveAttachment = { path, name, addedAt: now }
    this.file.update((value) => {
      value.attachments[attachmentKey(identifier, episodeIndex)] = attachment
    })
    return attachment
  }

  detach(identifier: string, episodeIndex: number): boolean {
    const key = attachmentKey(identifier, episodeIndex)
    if (!this.file.data.attachments[key]) return false
    this.file.update((value) => {
      delete value.attachments[key]
    })
    return true
  }

  async flush(): Promise<void> {
    await this.file.flush()
  }
}

function sanitize(raw: unknown): ArchiveStoreState {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<ArchiveStoreState>
  const entries: ArchiveSavedEntry[] = []
  const seen = new Set<string>()

  if (Array.isArray(source.entries)) {
    for (const entry of source.entries) {
      if (!entry || typeof entry !== 'object') continue
      const candidate = entry as Partial<ArchiveSavedEntry>
      const item = sanitizeArchiveRecord(candidate.item)
      if (!item || seen.has(item.identifier)) continue
      seen.add(item.identifier)
      entries.push({
        item,
        savedAt: typeof candidate.savedAt === 'number' && Number.isFinite(candidate.savedAt) ? candidate.savedAt : Date.now(),
        lastPlayedAt:
          typeof candidate.lastPlayedAt === 'number' && Number.isFinite(candidate.lastPlayedAt)
            ? candidate.lastPlayedAt
            : null,
        lastEpisodeIndex:
          typeof candidate.lastEpisodeIndex === 'number' && Number.isInteger(candidate.lastEpisodeIndex)
            ? candidate.lastEpisodeIndex
            : null
      })
    }
  }

  // Keep the store bounded even if the file is hand-edited.
  entries.splice(500)

  const attachments: Record<string, ArchiveAttachment> = {}
  if (source.attachments && typeof source.attachments === 'object') {
    for (const [key, value] of Object.entries(source.attachments as Record<string, unknown>)) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}#\d{1,4}$/.test(key)) continue
      if (!value || typeof value !== 'object') continue
      const attachment = value as Partial<ArchiveAttachment>
      if (typeof attachment.path !== 'string' || attachment.path.length === 0) continue
      attachments[key] = {
        path: attachment.path,
        name: typeof attachment.name === 'string' && attachment.name.length > 0 ? attachment.name.slice(0, 200) : 'Subtitles',
        addedAt: typeof attachment.addedAt === 'number' && Number.isFinite(attachment.addedAt) ? attachment.addedAt : Date.now()
      }
    }
  }

  return { entries, attachments }
}
