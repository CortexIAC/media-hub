import type { AppSettings, PlaybackSession } from '@core/models'
import { DEFAULT_SETTINGS, sanitizeEqualizer } from '@core/models'
import { JsonFile } from './jsonFile'

const ACCENT_PATTERN = /^#[0-9a-fA-F]{6}$/

export class SettingsStore {
  private readonly file: JsonFile<AppSettings>

  constructor(filePath: string) {
    this.file = new JsonFile<AppSettings>(filePath, () => ({ ...DEFAULT_SETTINGS }), sanitizeSettings)
  }

  async load(): Promise<void> {
    await this.file.load()
  }

  get value(): AppSettings {
    return this.file.data
  }

  update(patch: Partial<AppSettings>): AppSettings {
    const next = sanitizeSettings({ ...this.file.data, ...patch })
    this.file.set(next)
    return next
  }

  async flush(): Promise<void> {
    await this.file.flush()
  }
}

export class SessionStore {
  private readonly file: JsonFile<PlaybackSession | null>

  constructor(filePath: string) {
    this.file = new JsonFile<PlaybackSession | null>(filePath, () => null, sanitizeSession)
  }

  async load(): Promise<void> {
    await this.file.load()
  }

  get value(): PlaybackSession | null {
    return this.file.data
  }

  save(session: PlaybackSession): void {
    const clean = sanitizeSession(session)
    if (clean) this.file.set(clean)
  }

  async flush(): Promise<void> {
    await this.file.flush()
  }
}

export function sanitizeSettings(raw: unknown): AppSettings {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Partial<AppSettings>
  const volume = typeof source.volume === 'number' && Number.isFinite(source.volume) ? source.volume : DEFAULT_SETTINGS.volume
  const repeat = source.repeat === 'all' || source.repeat === 'one' ? source.repeat : 'off'
  return {
    volume: Math.min(1, Math.max(0, volume)),
    muted: Boolean(source.muted),
    shuffle: Boolean(source.shuffle),
    repeat,
    scanOnStartup: Boolean(source.scanOnStartup),
    accent: typeof source.accent === 'string' && ACCENT_PATTERN.test(source.accent) ? source.accent : DEFAULT_SETTINGS.accent,
    equalizer: sanitizeEqualizer(source.equalizer),
    youtubeApiKey:
      typeof source.youtubeApiKey === 'string' ? source.youtubeApiKey.trim().slice(0, 200) : DEFAULT_SETTINGS.youtubeApiKey
  }
}

export function sanitizeSession(raw: unknown): PlaybackSession | null {
  if (!raw || typeof raw !== 'object') return null
  const source = raw as Partial<PlaybackSession>
  const queueIds = Array.isArray(source.queueIds)
    ? source.queueIds.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, 5000)
    : []
  if (queueIds.length === 0) return null
  const index = typeof source.queueIndex === 'number' && Number.isFinite(source.queueIndex) ? Math.trunc(source.queueIndex) : 0
  const positionMs =
    typeof source.positionMs === 'number' && Number.isFinite(source.positionMs) ? Math.max(0, source.positionMs) : 0
  const trackId = typeof source.trackId === 'string' && queueIds.includes(source.trackId) ? source.trackId : null
  return {
    trackId,
    queueIds,
    queueIndex: Math.min(Math.max(0, index), queueIds.length - 1),
    positionMs,
    updatedAt: typeof source.updatedAt === 'number' ? source.updatedAt : Date.now()
  }
}
