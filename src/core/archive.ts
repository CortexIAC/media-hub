/**
 * Internet Archive item parsing and pure helpers.
 *
 * The Archive tab searches archive.org's public `advancedsearch.php` API and
 * reads each item's `metadata/{identifier}` document. That document is messy:
 * the same recording is listed several times under derivative names
 * (`episode.mp4`, `episode.ia.mp4`, `episode_512kb.mp4`, `episode.ogv`), times
 * arrive as either seconds or `mm:ss`, and closed captions are optional sidecars
 * with their own naming conventions.
 *
 * This module turns that into a single list of episodes with human labels. It has
 * no Electron, Node or DOM imports so the rules can be unit tested directly.
 */

export type ArchiveMediaType = 'movies' | 'audio'

export interface ArchiveSubtitleFile {
  label: string
  language: string | null
  /** Absolute archive.org download URL. */
  url: string
  bytes: number | null
}

/** What is stored for a saved show or movie. Stable, no derived URLs. */
export interface ArchiveEpisodeRecord {
  index: number
  /** Display label, e.g. `S01E02 · New Kid` or `Part 3 · The Cave`. */
  label: string
  title: string
  season: number | null
  episode: number | null
  fileName: string
  /** Absolute archive.org download URL for the media file. */
  url: string
  format: string
  durationMs: number | null
  sizeBytes: number | null
  subtitles: ArchiveSubtitleFile[]
}

export interface ArchiveItemRecord {
  identifier: string
  title: string
  creator: string | null
  year: number | null
  description: string | null
  collection: string | null
  licenseUrl: string | null
  mediaType: ArchiveMediaType
  episodes: ArchiveEpisodeRecord[]
}

export interface ArchiveSearchDoc {
  identifier: string
  title: string
  creator: string | null
  year: number | null
  description: string | null
  collection: string | null
  mediaType: ArchiveMediaType
  downloads: number | null
}

/** Raw shapes from the Internet Archive JSON documents, all optional. */
interface RawFile {
  name?: unknown
  format?: unknown
  size?: unknown
  length?: unknown
  title?: unknown
  private?: unknown
}

interface RawItem {
  metadata?: Record<string, unknown>
  files?: unknown
  is_dark?: unknown
}

const VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.webm', '.ogv', '.ogm', '.mov', '.mkv', '.mpg', '.mpeg', '.avi', '.wmv', '.flv', '.m2ts', '.ts'])
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac', '.wav'])

/** IA derivative suffixes applied to the same underlying recording. */
const DERIVATIVE_SUFFIX = /(?:\.ia|_512kb|_256kb|_128kb|_64kb|\.512kb|\.256kb|\.128kb|\.64kb|_h264|\.h264)$/i

const SUBTITLE_SUFFIX = /\.(?:cc\d+|asr|align|sdh|forced|transcript|en|eng|english|es|spa|spanish|fr|fre|french|de|ger|german|ar|ara|arabic|pt|por|ru|rus|hi|hin)$/i

const MAX_EPISODES = 800

export function archiveIdentifierIsValid(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(raw)
}

export function archiveDownloadUrl(identifier: string, fileName: string): string {
  const path = String(fileName)
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${path}`
}

export function archiveDetailsUrl(identifier: string): string {
  return `https://archive.org/details/${encodeURIComponent(identifier)}`
}

export function archiveItemImageUrl(identifier: string): string {
  return `https://archive.org/services/img/${encodeURIComponent(identifier)}`
}

function extensionOf(name: string): string {
  const base = name.split('/').pop() ?? name
  const dot = base.lastIndexOf('.')
  return dot <= 0 ? '' : base.slice(dot).toLowerCase()
}

function stripExtension(name: string): string {
  return name.replace(/\.[A-Za-z0-9]{1,5}$/, '')
}

function baseStem(name: string): string {
  return stripExtension(name).replace(DERIVATIVE_SUFFIX, '')
}

function scoreMedia(name: string, format: string): number {
  const extension = extensionOf(name)
  const isVideo = VIDEO_EXTENSIONS.has(extension)
  const isAudio = AUDIO_EXTENSIONS.has(extension)
  if (!isVideo && !isAudio) return 0

  let score = isVideo ? 100 : 60
  switch (extension) {
    case '.mp4':
    case '.m4v':
      score += 45
      break
    case '.webm':
      score += 35
      break
    case '.ogv':
    case '.ogm':
      score += 20
      break
    case '.mov':
      score += 22
      break
    case '.mpg':
    case '.mpeg':
      score -= 10
      break
    case '.mkv':
      score += 10
      break
    case '.m4a':
      score += 25
      break
    case '.mp3':
      score += 20
      break
    default:
      break
  }

  const normalised = format.toLowerCase()
  // `h.264 IA` is a re-encode that is generally larger and slower to fetch than
  // the file the uploader provided. Prefer the original where both exist.
  if (/h\.264 ia|512kb/.test(normalised)) score -= 8
  if (/^mpeg4$|^h\.264$/.test(normalised)) score += 6
  return score
}

interface Candidate {
  name: string
  format: string
  sizeBytes: number | null
  durationMs: number | null
  score: number
  stem: string
}

/** Collapses derivatives of the same recording and keeps the best copy. */
export function pickPlayableFiles(files: RawFile[]): Candidate[] {
  const best = new Map<string, Candidate>()
  for (const file of files) {
    if (typeof file.name !== 'string' || file.name.length === 0) continue
    if (file.private === true) continue
    const format = typeof file.format === 'string' ? file.format : ''
    const score = scoreMedia(file.name, format)
    if (score === 0) continue
    const stem = baseStem(file.name).toLowerCase()
    const size = toNumber(file.size)
    const duration = parseArchiveLength(file.length)
    const candidate: Candidate = {
      name: file.name,
      format: format || extensionOf(file.name).replace('.', '').toUpperCase(),
      sizeBytes: size,
      durationMs: duration,
      score,
      stem
    }
    const previous = best.get(stem)
    if (!previous || candidate.score > previous.score) best.set(stem, candidate)
  }
  return [...best.values()]
}

export function parseArchiveLength(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? Math.round(raw * 1000) : null
  }
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (value.length === 0) return null
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const seconds = Number(value)
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null
  }
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?$/.exec(value)
  if (!match) return null
  const first = Number(match[1])
  const second = Number(match[2])
  const third = match[3] === undefined ? null : Number(match[3])
  const fraction = match[4] === undefined ? 0 : Number(`0.${match[4]}`)
  const seconds = third === null ? first * 60 + second : first * 3600 + second * 60 + third
  return Math.round((seconds + fraction) * 1000)
}

function toNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
  }
  return null
}

function firstString(raw: unknown): string | null {
  if (typeof raw === 'string') return raw.trim() || null
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const value = firstString(entry)
      if (value) return value
    }
  }
  return null
}

function stringArray(raw: unknown): string[] {
  if (typeof raw === 'string') return [raw]
  if (Array.isArray(raw)) return raw.filter((entry): entry is string => typeof entry === 'string')
  return []
}

function plainText(raw: unknown, max: number): string | null {
  const value = firstString(raw)
  if (!value) return null
  const clean = value
    .replace(/<\s*br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
  if (clean.length === 0) return null
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

function parseYear(raw: unknown): number | null {
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  return Number.isFinite(value) && value > 1200 && value < 2200 ? value : null
}

/** `cc5`-style suffixes and language tags, used to pair captions with video. */
function subtitleStemKey(name: string): string {
  let stem = stripExtension(name)
  for (let pass = 0; pass < 4; pass += 1) {
    const next = stem.replace(SUBTITLE_SUFFIX, '')
    if (next === stem) break
    stem = next
  }
  return stem.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function mediaStemKey(name: string): string {
  return baseStem(name).toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function subtitleLanguage(name: string): string | null {
  const lower = stripExtension(name).toLowerCase()
  // CC1/CC2 carry the primary English caption service; CC3/CC4 are the
  // secondary (usually Spanish) channel in the US ATSC layout.
  if (/\.(?:cc1|cc2|cc5|en|eng|english)\b/.test(lower) || /\.(?:cc1|cc2|cc5|en)$/.test(lower)) return 'en'
  if (/\.(?:cc3|cc4)\b/.test(lower) || /\.(?:cc3|cc4)$/.test(lower)) return 'es'
  if (/\.(?:ar|ara|arabic)\b/.test(lower)) return 'ar'
  if (/\.(?:es|spa|spanish)\b/.test(lower)) return 'es'
  if (/\.(?:fr|fre|french)\b/.test(lower)) return 'fr'
  if (/\.(?:de|ger|german)\b/.test(lower)) return 'de'
  if (/\.(?:pt|por)\b/.test(lower)) return 'pt'
  if (/\.(?:ru|rus)\b/.test(lower)) return 'ru'
  return null
}

function subtitleLabel(name: string): string {
  const language = subtitleLanguage(name)
  const kind = /\.asr\./i.test(name) ? 'auto-captions' : /\.align\./i.test(name) ? 'aligned captions' : 'captions'
  const languageName =
    language === 'en'
      ? 'English'
      : language === 'ar'
        ? 'Arabic'
        : language === 'es'
          ? 'Spanish'
          : language === 'fr'
            ? 'French'
            : language === 'de'
              ? 'German'
              : language === 'pt'
                ? 'Portuguese'
                : language === 'ru'
                  ? 'Russian'
                  : 'Archive'
  const format = extensionOf(name).replace('.', '').toUpperCase()
  return `${languageName === 'Archive' ? 'Captions' : languageName} ${kind} (${format})`
}

export interface EpisodeLabel {
  title: string
  season: number | null
  episode: number | null
  label: string
}

/**
 * Derives an episode label from a file name.
 *
 * `Tower_Prep_S01E02_Monitored.mp4` becomes `S01E02 · Monitored`, and a file
 * named only `03 The Cave.mp4` keeps its number. When no numbering exists the
 * cleaned file name is the title, which is the honest fallback: the app never
 * invents an episode order that the archive does not have.
 */
export function labelEpisode(fileName: string, showTitle = ''): EpisodeLabel {
  const stem = stripExtension(fileName.split('/').pop() ?? fileName).replace(DERIVATIVE_SUFFIX, '')
  let text = humanize(stem)

  // A leading `03 - ` is the episode number; lift it before removing the show
  // name so `03 - Show - Title` keeps its numbering.
  let leadingNumber: number | null = null
  const leading = /^(\d{1,3})[\s._-]+/.exec(text)
  if (leading) {
    leadingNumber = Number(leading[1])
    text = text.slice(leading[0].length)
  }

  text = stripShowPrefix(text, showTitle)

  let season: number | null = null
  let episode: number | null = null

  const seasonEpisode = /\bs(?:eason)?\s*(\d{1,2})\s*[\s._-]*e\s*(\d{1,3})\b/i.exec(text)
  const crossOver = /\b(\d{1,2})\s*x\s*(\d{1,3})\b/i.exec(text)
  if (seasonEpisode) {
    season = Number(seasonEpisode[1])
    episode = Number(seasonEpisode[2])
    text = text.replace(seasonEpisode[0], ' ')
  } else if (crossOver) {
    season = Number(crossOver[1])
    episode = Number(crossOver[2])
    text = text.replace(crossOver[0], ' ')
  } else {
    const episodeOnly = /\b(?:episode|ep)\s*\.?\s*(\d{1,3})\b/i.exec(text)
    const shortEpisode = /\bE(\d{1,3})\b/.exec(text)
    const part = /\bpart\s*\.?\s*(\d{1,3})\b/i.exec(text)
    if (episodeOnly) {
      episode = Number(episodeOnly[1])
      text = text.replace(episodeOnly[0], ' ')
    } else if (shortEpisode) {
      episode = Number(shortEpisode[1])
      text = text.replace(shortEpisode[0], ' ')
    } else if (part) {
      episode = Number(part[1])
      text = text.replace(part[0], ' ')
    } else {
      episode = leadingNumber
    }
  }

  const title = tidyTitle(text) || humanize(showTitle) || 'Untitled'
  return { title, season, episode, label: formatEpisodeLabel(title, season, episode) }
}

export function formatEpisodeLabel(title: string, season: number | null, episode: number | null): string {
  if (season !== null && episode !== null) {
    return `S${pad(season)}E${pad(episode)} · ${title}`
  }
  if (episode !== null) return `Ep ${episode} · ${title}`
  return title
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

function normaliseToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/**
 * Removes the show's own name from the start of an episode label.
 *
 * Uploads name files after the show (`Tower_Prep_S01E02_Monitored`) while the
 * item title is often longer (`Tower Prep - Complete Series`), so a whole-string
 * prefix check is not enough. Tokens are compared until they diverge, and a
 * character-level fallback covers names split by underscores (`Blue_s_Clues`).
 */
function stripShowPrefix(text: string, showTitle: string): string {
  const textTokens = humanize(text).split(/\s+/).filter(Boolean)
  const showTokens = humanize(showTitle).split(/\s+/).filter(Boolean)
  let matched = 0
  while (
    matched < showTokens.length &&
    matched < textTokens.length &&
    normaliseToken(textTokens[matched] ?? '') === normaliseToken(showTokens[matched] ?? '') &&
    normaliseToken(textTokens[matched] ?? '').length > 0
  ) {
    matched += 1
  }
  if (matched > 0) return textTokens.slice(matched).join(' ')

  const target = normaliseToken(showTitle)
  if (target.length < 4) return text
  const source = normaliseToken(text)
  let common = 0
  while (common < source.length && common < target.length && source[common] === target[common]) common += 1
  if (common < Math.min(4, target.length) || common < Math.ceil(target.length * 0.6)) return text

  let consumed = ''
  for (let index = 0; index < text.length; index += 1) {
    consumed += text[index] ?? ''
    if (normaliseToken(consumed).length >= common) return text.slice(index + 1)
  }
  return text
}

function humanize(value: string): string {
  return value
    .replace(/[_]+/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tidyTitle(value: string): string {
  return value
    .replace(/^[\s._-]+/, '')
    .replace(/[\s._-]+/g, ' ')
    .replace(/\s*\(\s*\)/g, '')
    .replace(/\s*\[\s*\]/g, '')
    .trim()
    .replace(/^[-–—:]\s*/, '')
}

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function pickSubtitleFor(fileName: string, subtitles: ArchiveSubtitleFile[]): ArchiveSubtitleFile | null {
  if (subtitles.length === 0) return null
  const mediaKey = mediaStemKey(fileName)
  const usable = subtitles.filter((subtitle) => (subtitle.bytes ?? 0) > 0)
  const pool = usable.length > 0 ? usable : subtitles

  let best: { subtitle: ArchiveSubtitleFile; score: number } | null = null
  for (const subtitle of pool) {
    const url = decodeURIComponent(subtitle.url.split('/').pop() ?? '')
    const key = subtitleStemKey(url)
    let score = 0
    if (key.length > 0 && key === mediaKey) score = 100
    else if (key.length > 0 && mediaKey.startsWith(key)) score = 70
    else if (key.length > 0 && key.startsWith(mediaKey)) score = 60
    else if (subtitle.language === 'en') score = 10
    if (score === 0) continue
    if (!best || score > best.score) best = { subtitle, score }
  }
  if (best) return best.subtitle
  return pool.length === 1 ? pool[0] ?? null : null
}

export interface CollectedSubtitle extends ArchiveSubtitleFile {
  fileName: string
}

/** Filters the item's file list down to captions the app can convert to VTT. */
export function collectSubtitles(files: RawFile[]): CollectedSubtitle[] {
  const collected: CollectedSubtitle[] = []
  for (const file of files) {
    if (typeof file.name !== 'string') continue
    const extension = extensionOf(file.name)
    if (extension !== '.srt' && extension !== '.vtt') continue
    const format = typeof file.format === 'string' ? file.format.toLowerCase() : ''
    if (
      format.length > 0 &&
      !format.includes('subrip') &&
      !format.includes('webvtt') &&
      !format.includes('caption') &&
      !format.includes('text') &&
      !format.includes('plain')
    ) {
      continue
    }
    collected.push({
      fileName: file.name,
      label: subtitleLabel(file.name),
      language: subtitleLanguage(file.name),
      url: '', // completed by parseArchiveItem, which knows the identifier
      bytes: toNumber(file.size)
    })
  }
  return collected
}

/**
 * Turns an item's metadata document into episodes.
 *
 * Returns null for a dark (unavailable) item or one with no playable media, so
 * the UI can explain the problem instead of showing an empty show.
 */
export function parseArchiveItem(identifier: string, raw: unknown): ArchiveItemRecord | null {
  if (!archiveIdentifierIsValid(identifier)) return null
  if (!raw || typeof raw !== 'object') return null
  const item = raw as RawItem
  if (item.is_dark === true) return null
  const metadata = (item.metadata ?? {}) as Record<string, unknown>
  const files = Array.isArray(item.files) ? (item.files as RawFile[]) : []
  if (files.length === 0) return null

  const title = plainText(metadata.title, 300) ?? identifier
  const creator = plainText(metadata.creator, 200)
  const description = plainText(metadata.description, 700)
  const collection = stringArray(metadata.collection)[0] ?? null
  const licenseUrl = firstString(metadata.licenseurl)
  const year = parseYear(metadata.year ?? metadata.date)
  const mediaType: ArchiveMediaType = firstString(metadata.mediatype) === 'audio' ? 'audio' : 'movies'

  const subtitles: ArchiveSubtitleFile[] = collectSubtitles(files).map(({ fileName, ...subtitle }) => ({
    ...subtitle,
    url: archiveDownloadUrl(identifier, fileName)
  }))

  const picked = pickPlayableFiles(files).sort((a, b) => naturalCompare(a.name, b.name))
  const episodes: ArchiveEpisodeRecord[] = picked.slice(0, MAX_EPISODES).map((file, index) => {
    const label = labelEpisode(file.name, title)
    return {
      index,
      label: label.label,
      title: label.title,
      season: label.season,
      episode: label.episode,
      fileName: file.name,
      url: archiveDownloadUrl(identifier, file.name),
      format: file.format,
      durationMs: file.durationMs,
      sizeBytes: file.sizeBytes,
      subtitles: subtitles.filter((subtitle) => subtitleMatches(file.name, subtitle, picked.length))
    }
  })

  if (episodes.length === 0) return null

  episodes.sort((a, b) => {
    if (a.season !== null && b.season !== null && a.season !== b.season) return a.season - b.season
    if (a.episode !== null && b.episode !== null && a.episode !== b.episode) return a.episode - b.episode
    return naturalCompare(a.fileName, b.fileName)
  })
  episodes.forEach((episode, index) => {
    episode.index = index
  })

  return { identifier, title, creator, year, description, collection, licenseUrl, mediaType, episodes }
}

function subtitleMatches(mediaFileName: string, subtitle: ArchiveSubtitleFile, mediaCount: number): boolean {
  if (mediaCount === 1) return true
  const mediaKey = mediaStemKey(mediaFileName)
  const key = subtitleStemKey(decodeURIComponent(subtitle.url.split('/').pop() ?? ''))
  if (key.length === 0) return false
  return key === mediaKey || mediaKey.startsWith(key) || key.startsWith(mediaKey)
}

/** The caption a player should offer for an episode, if the item ships one. */
export function bestSubtitle(episode: ArchiveEpisodeRecord): ArchiveSubtitleFile | null {
  return pickSubtitleFor(episode.fileName, episode.subtitles)
}

export function parseArchiveSearchDocs(docs: unknown): ArchiveSearchDoc[] {
  if (!Array.isArray(docs)) return []
  const seen = new Set<string>()
  const results: ArchiveSearchDoc[] = []
  for (const raw of docs) {
    if (!raw || typeof raw !== 'object') continue
    const doc = raw as Record<string, unknown>
    const identifier = firstString(doc.identifier)
    if (!identifier || !archiveIdentifierIsValid(identifier) || seen.has(identifier)) continue
    seen.add(identifier)
    const downloads = toNumber(doc.downloads)
    results.push({
      identifier,
      title: plainText(doc.title, 240) ?? identifier,
      creator: plainText(doc.creator, 160),
      year: parseYear(doc.year ?? doc.date),
      description: plainText(doc.description, 240),
      collection: stringArray(doc.collection)[0] ?? null,
      mediaType: firstString(doc.mediatype) === 'audio' ? 'audio' : 'movies',
      downloads: downloads === null ? null : Math.round(downloads)
    })
  }
  return results
}

/**
 * Orders search hits so the thing the user typed comes first.
 *
 * The archive's own relevance ordering puts items that merely share a word
 * ("Interview w/Barney Frank") beside the actual show. An exact phrase in the
 * title, a title that starts with the phrase, and full token coverage all push a
 * hit up; downloads only break ties. Apostrophes are dropped so "blue's clues"
 * matches both "Blue's Clues" and "Blues Clues" uploads.
 */
export function rankArchiveSearchDocs(docs: ArchiveSearchDoc[], query: string): ArchiveSearchDoc[] {
  const phrase = normaliseQuery(query)
  if (phrase.length === 0) return docs
  const tokens = phrase.split(' ').filter((token) => token.length > 1)

  const score = (doc: ArchiveSearchDoc): number => {
    const title = normaliseQuery(doc.title)
    let value = 0
    if (title === phrase) value += 120
    else if (title.startsWith(phrase)) value += 70
    else if (title.includes(phrase)) value += 45
    if (tokens.length > 0 && tokens.every((token) => title.includes(token))) value += 20
    const matched = tokens.filter((token) => title.includes(token)).length
    value += Math.round((matched / Math.max(tokens.length, 1)) * 10)
    if (doc.collection && /animation|cartoon|classic_tv|television|moviesandfilms|vintage/i.test(doc.collection)) value += 6
    value += Math.min(6, Math.log10(1 + (doc.downloads ?? 0)) * 1.5)
    return value
  }

  return docs
    .map((doc, index) => ({ doc, index, value: score(doc) }))
    .sort((a, b) => b.value - a.value || a.index - b.index)
    .map((entry) => entry.doc)
}

function normaliseQuery(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function archiveKindOf(item: { episodes: unknown[] }): 'show' | 'movie' {
  return item.episodes.length > 1 ? 'show' : 'movie'
}

export function itemIsSaved(identifier: string, savedIdentifiers: ReadonlySet<string>): boolean {
  return savedIdentifiers.has(identifier)
}

/* ------------------------------------------------------------------------- */
/* Subtitles                                                                  */
/* ------------------------------------------------------------------------- */

const TIMING = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2})(?::(\d{2}))?[,.](\d{1,3})(.*)$/

function normaliseTiming(match: RegExpExecArray): string {
  const startHours = match[3] === undefined ? 0 : Number(match[1])
  const startMinutes = match[3] === undefined ? Number(match[1]) : Number(match[2])
  const startSeconds = match[3] === undefined ? Number(match[2]) : Number(match[3])
  const endHours = match[7] === undefined ? 0 : Number(match[5])
  const endMinutes = match[7] === undefined ? Number(match[5]) : Number(match[6])
  const endSeconds = match[7] === undefined ? Number(match[6]) : Number(match[7])
  const format = (hours: number, minutes: number, seconds: number, millis: string): string =>
    `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${millis.padEnd(3, '0')}`
  const settings = match[9]?.trim()
  return `${format(startHours, startMinutes, startSeconds, match[4] ?? '0')} --> ${format(endHours, endMinutes, endSeconds, match[8] ?? '0')}${settings ? ` ${settings}` : ''}`
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

function stripCaptionMarkup(line: string): string {
  return line
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/<\/?(?:i|b|u|font|c|v)(?:\s[^>]*)?>/gi, (match) => {
      const tag = /^<(\/?[a-z]+)/i.exec(match)?.[1]?.toLowerCase()
      return tag === '/i' || tag === 'i' || tag === '/b' || tag === 'b' || tag === '/u' || tag === 'u' ? match : ''
    })
}

/**
 * Decodes a subtitle file that may have come from Windows.
 *
 * SubRip files exported by older tools are UTF-16LE with a BOM; reading those as
 * UTF-8 yields NUL characters and no cues at all. The BOM decides the encoding.
 */
export function decodeSubtitleBytes(input: Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(0)
  const decode = (encoding: string): string => new TextDecoder(encoding, { fatal: false }).decode(bytes)
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return decode('utf-16le').replace(/^\uFEFF/, '')
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return decode('utf-16be').replace(/^\uFEFF/, '')
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return decode('utf-8').replace(/^\uFEFF/, '')
  }
  return decode('utf-8')
}

/**
 * Converts SubRip or WebVTT text into WebVTT.
 *
 * Closed-caption sidecars on the Internet Archive are SubRip with CRLF endings,
 * cue numbers and occasional ASS override tags; Chromium only accepts WebVTT in
 * a `<track>`, so the conversion happens in the main process before the file is
 * handed to the player. Already-valid VTT is passed through.
 */
export function toWebVtt(input: string): string {
  const text = String(input ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  if (/^\s*WEBVTT/.test(text)) {
    const body = text.trimEnd()
    return `${body}\n`
  }

  const lines = text.split('\n')
  const cues: Array<{ timing: string; body: string[] }> = []
  let current: { timing: string; body: string[] } | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const timing = TIMING.exec(line)
    if (timing) {
      current = { timing: normaliseTiming(timing), body: [] }
      cues.push(current)
      continue
    }
    if (!current) continue
    const trimmed = line.trim()
    const next = lines[index + 1] ?? ''
    // A bare number immediately before a timing line is a SubRip cue index.
    if (/^\d+$/.test(trimmed) && TIMING.test(next)) continue
    if (/^NOTE\b/i.test(trimmed)) continue
    current.body.push(stripCaptionMarkup(line))
  }

  const rendered = cues
    .map((cue) => {
      const body = cue.body.join('\n').replace(/^\n+|\n+$/g, '')
      return body.length > 0 ? `${cue.timing}\n${body}` : `${cue.timing}`
    })
    .join('\n\n')

  return `WEBVTT\n\n${rendered}${rendered.endsWith('\n') ? '' : '\n'}`
}

/* ------------------------------------------------------------------------- */
/* Stored records                                                             */
/* ------------------------------------------------------------------------- */

function isArchiveUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && (url.hostname === 'archive.org' || url.hostname.endsWith('.archive.org'))
  } catch {
    return false
  }
}

export function sanitizeArchiveRecord(raw: unknown): ArchiveItemRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<ArchiveItemRecord>
  if (!archiveIdentifierIsValid(value.identifier)) return null
  if (typeof value.title !== 'string' || value.title.trim().length === 0) return null
  if (!Array.isArray(value.episodes) || value.episodes.length === 0) return null

  const episodes: ArchiveEpisodeRecord[] = []
  for (const entry of value.episodes) {
    if (!entry || typeof entry !== 'object') continue
    const episode = entry as Partial<ArchiveEpisodeRecord>
    if (typeof episode.url !== 'string' || !isArchiveUrl(episode.url)) continue
    if (typeof episode.fileName !== 'string' || episode.fileName.length === 0) continue
    const subtitles: ArchiveSubtitleFile[] = []
    if (Array.isArray(episode.subtitles)) {
      for (const subtitle of episode.subtitles) {
        if (!subtitle || typeof subtitle !== 'object') continue
        const candidate = subtitle as Partial<ArchiveSubtitleFile>
        if (!isArchiveUrl(candidate.url)) continue
        subtitles.push({
          label: typeof candidate.label === 'string' ? candidate.label.slice(0, 120) : 'Captions',
          language: typeof candidate.language === 'string' ? candidate.language.slice(0, 12) : null,
          url: candidate.url,
          bytes: typeof candidate.bytes === 'number' && Number.isFinite(candidate.bytes) ? candidate.bytes : null
        })
      }
    }
    const label = typeof episode.label === 'string' && episode.label.trim().length > 0 ? episode.label.trim().slice(0, 300) : 'Episode'
    episodes.push({
      index: episodes.length,
      label,
      title: typeof episode.title === 'string' && episode.title.trim().length > 0 ? episode.title.trim().slice(0, 300) : label,
      season: numberOrNull(episode.season),
      episode: numberOrNull(episode.episode),
      fileName: episode.fileName.slice(0, 500),
      url: episode.url,
      format: typeof episode.format === 'string' ? episode.format.slice(0, 60) : '',
      durationMs: numberOrNull(episode.durationMs),
      sizeBytes: numberOrNull(episode.sizeBytes),
      subtitles
    })
    if (episodes.length >= MAX_EPISODES) break
  }
  if (episodes.length === 0) return null

  return {
    identifier: value.identifier,
    title: value.title.trim().slice(0, 300),
    creator: typeof value.creator === 'string' ? value.creator.slice(0, 200) : null,
    year: numberOrNull(value.year),
    description: typeof value.description === 'string' ? value.description.slice(0, 1200) : null,
    collection: typeof value.collection === 'string' ? value.collection.slice(0, 120) : null,
    licenseUrl: typeof value.licenseUrl === 'string' && /^https?:\/\//.test(value.licenseUrl) ? value.licenseUrl.slice(0, 400) : null,
    mediaType: value.mediaType === 'audio' ? 'audio' : 'movies',
    episodes
  }
}

function numberOrNull(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

/** A short, honest rights line derived from the item's own metadata. */
export function rightsLabel(licenseUrl: string | null): string {
  if (!licenseUrl) return 'No licence given — check the item’s rights statement before saving or reusing.'
  const value = licenseUrl.toLowerCase()
  if (value.includes('publicdomain') || value.includes('public-domain')) {
    return 'Marked public domain by the uploader.'
  }
  if (value.includes('licenses/by-nc-nd')) return 'CC BY-NC-ND — viewing is allowed; no derivatives or commercial use.'
  if (value.includes('licenses/by-nc')) return 'CC BY-NC — viewing is allowed; no commercial use.'
  if (value.includes('licenses/by-nd')) return 'CC BY-ND — viewing is allowed; no derivatives.'
  if (value.includes('licenses/by')) return 'CC BY — viewing is allowed with attribution.'
  if (value.includes('licenses/zero') || value.includes('cc0')) return 'CC0 — no rights reserved.'
  return 'Licence set by the uploader — check the item page.'
}
