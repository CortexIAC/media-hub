/**
 * Release-note normalisation.
 *
 * Notes reach the app in three shapes: plain text from `latest.yml`, an array of
 * per-version entries from electron-updater's GitHub provider, or the HTML-ish
 * block electron-builder builds out of the release commit (`<p>…</p>`, `<li>…`,
 * with the newlines escaped as literal `\n`). The Settings panel renders plain
 * text, so everything is flattened here, once, away from the UI.
 */

export type ReleaseNotesInput = string | { note: string | null }[] | null | undefined

const PARAGRAPH = '\u0000PARA\u0000'

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

export function normalizeReleaseNotes(raw: string): string {
  const source = raw.replace(/\r/g, '')
  const hasMarkup = /<\/?(?:p|br|li|ul|ol|div|h[1-6])\b/i.test(source)

  let text = source
  if (hasMarkup) {
    text = text
      // A paragraph boundary is the only thing that earns a blank line.
      .replace(/<\/p>\s*<p[^>]*>/gi, PARAGRAPH)
      .replace(/<(ul|ol)[^>]*>\s*/gi, '')
      .replace(/\s*<\/(ul|ol)>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|li|h[1-6]|div)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{2,}/g, '\n')
      .replace(new RegExp(PARAGRAPH, 'g'), '\n\n')
  }

  return decodeEntities(text)
    // electron-builder escapes the newlines in the body it copies.
    .replace(/\\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function releaseNotesToText(notes: ReleaseNotesInput, limit = 4000): string | null {
  if (!notes) return null
  const raw = Array.isArray(notes) ? notes.map((entry) => entry.note ?? '').join('\n\n') : notes
  if (typeof raw !== 'string') return null
  const text = normalizeReleaseNotes(raw)
  return text.length === 0 ? null : text.slice(0, limit)
}
