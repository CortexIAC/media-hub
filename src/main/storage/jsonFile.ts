import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Small durable JSON file with debounced, atomic writes.
 *
 * - Writes go to a temp file then rename over the target, so a crash cannot
 *   leave a half-written library behind.
 * - A corrupt file is moved aside instead of being deleted, and defaults are
 *   used so the app still starts.
 * - Writes are coalesced; call `flush()` before quitting.
 */
export class JsonFile<T> {
  private readonly filePath: string
  private readonly createDefaults: () => T
  private readonly sanitize: (raw: unknown) => T
  private value: T | null = null
  private loaded = false
  private timer: NodeJS.Timeout | null = null
  private writeChain: Promise<void> = Promise.resolve()
  private dirty = false

  constructor(filePath: string, createDefaults: () => T, sanitize: (raw: unknown) => T) {
    this.filePath = filePath
    this.createDefaults = createDefaults
    this.sanitize = sanitize
  }

  get path(): string {
    return this.filePath
  }

  async load(): Promise<T> {
    if (this.loaded) return this.data
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      this.value = this.sanitize(JSON.parse(raw) as unknown)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        console.warn(`[storage] could not read ${this.filePath}: ${describe(error)}`)
        await this.quarantine()
      }
      this.value = this.createDefaults()
    }
    this.loaded = true
    return this.data
  }

  get data(): T {
    if (!this.loaded) throw new Error(`JsonFile ${this.filePath} read before load()`)
    return this.value as T
  }

  /** Replace the value and schedule a write. */
  set(value: T): void {
    if (!this.loaded) throw new Error(`JsonFile ${this.filePath} written before load()`)
    this.value = value
    this.dirty = true
    this.schedule()
  }

  /** Mutate in place and schedule a write. */
  update(mutator: (value: T) => void): void {
    const value = this.data
    mutator(value)
    this.dirty = true
    this.schedule()
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (!this.dirty) return
    const snapshot = JSON.stringify(this.value, null, 2)
    this.dirty = false
    this.writeChain = this.writeChain.then(() => this.writeAtomic(snapshot)).catch((error) => {
      console.warn(`[storage] write failed for ${this.filePath}: ${describe(error)}`)
    })
    await this.writeChain
  }

  private schedule(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, 400)
    this.timer.unref?.()
  }

  private async writeAtomic(contents: string): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true })
    const tmp = `${this.filePath}.tmp`
    await fs.writeFile(tmp, contents, 'utf8')
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await fs.rename(tmp, this.filePath)
        return
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (attempt === 3) throw error
        // Windows can transiently lock the destination (indexers, AV scanners).
        if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES') {
          await new Promise((resolve) => setTimeout(resolve, 60 * (attempt + 1)))
          continue
        }
        throw error
      }
    }
  }

  private async quarantine(): Promise<void> {
    try {
      await fs.rename(this.filePath, `${this.filePath}.corrupt-${Date.now()}`)
    } catch {
      // Best effort only: the app still starts with defaults.
    }
  }
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const describe = describeError
