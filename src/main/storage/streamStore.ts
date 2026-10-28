import type { StreamSource } from '@core/streams'
import { sanitizeStreamSource } from '@core/streams'
import { JsonFile } from './jsonFile'

export interface StreamStoreState {
  sources: StreamSource[]
}

/** Saved network links. The URL is the identity, so re-adding one is a no-op. */
export class StreamStore {
  private readonly file: JsonFile<StreamStoreState>

  constructor(filePath: string) {
    this.file = new JsonFile<StreamStoreState>(filePath, () => ({ sources: [] }), sanitize)
  }

  async load(): Promise<void> {
    await this.file.load()
  }

  get sources(): StreamSource[] {
    return [...this.file.data.sources]
  }

  get(id: string): StreamSource | null {
    return this.file.data.sources.find((source) => source.id === id) ?? null
  }

  add(candidates: StreamSource[]): { added: StreamSource[]; skipped: number } {
    const byId = new Map(this.file.data.sources.map((source) => [source.id, source]))
    const added: StreamSource[] = []
    let skipped = 0

    for (const candidate of candidates) {
      const clean = sanitizeStreamSource(candidate)
      if (!clean) {
        skipped += 1
        continue
      }
      if (byId.has(clean.id)) {
        skipped += 1
        continue
      }
      byId.set(clean.id, clean)
      added.push(clean)
    }

    if (added.length > 0) {
      const sources = [...this.file.data.sources, ...added].slice(0, 2000)
      this.file.set({ ...this.file.data, sources })
    }
    return { added, skipped }
  }

  remove(id: string): boolean {
    const remaining = this.file.data.sources.filter((source) => source.id !== id)
    if (remaining.length === this.file.data.sources.length) return false
    this.file.set({ ...this.file.data, sources: remaining })
    return true
  }

  rename(id: string, name: string): StreamSource | null {
    const trimmed = name.trim().slice(0, 200)
    if (trimmed.length === 0) return null
    let renamed: StreamSource | null = null
    this.file.update((value) => {
      value.sources = value.sources.map((source) => {
        if (source.id !== id) return source
        renamed = { ...source, name: trimmed }
        return renamed
      })
    })
    return renamed
  }

  markPlayed(id: string, at = Date.now()): void {
    if (!this.file.data.sources.some((source) => source.id === id)) return
    this.file.update((value) => {
      value.sources = value.sources.map((source) => (source.id === id ? { ...source, lastPlayedAt: at } : source))
    })
  }

  async flush(): Promise<void> {
    await this.file.flush()
  }
}

function sanitize(raw: unknown): StreamStoreState {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<StreamStoreState>
  if (!Array.isArray(source.sources)) return { sources: [] }
  const seen = new Set<string>()
  const sources: StreamSource[] = []
  for (const entry of source.sources) {
    const clean = sanitizeStreamSource(entry)
    if (!clean || seen.has(clean.id)) continue
    seen.add(clean.id)
    sources.push(clean)
  }
  return { sources }
}
