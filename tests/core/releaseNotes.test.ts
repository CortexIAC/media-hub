import { describe, expect, it } from 'vitest'
import { normalizeReleaseNotes, releaseNotesToText } from '../../src/core/releaseNotes'

describe('release note normalisation', () => {
  it('flattens the HTML block electron-builder copies from a commit', () => {
    const raw =
      '<p>Bump to 0.1.1 to exercise the update path</p>\\n\\n<p>The feed needs a newer release<br />for a download.</p>'
    expect(normalizeReleaseNotes(raw)).toBe(
      'Bump to 0.1.1 to exercise the update path\n\nThe feed needs a newer release\nfor a download.'
    )
  })

  it('turns list items into one line each', () => {
    const raw = '<p>Notes</p>\n<ul>\n<li>First item</li>\n<li>Second item</li>\n</ul>'
    expect(normalizeReleaseNotes(raw)).toBe('Notes\nFirst item\nSecond item')
  })

  it('decodes entities and keeps angle brackets the author meant', () => {
    expect(normalizeReleaseNotes('Use &lt;Settings&gt; &amp; &quot;Updates&quot;')).toBe(
      'Use <Settings> & "Updates"'
    )
  })

  it('leaves plain text alone', () => {
    expect(normalizeReleaseNotes('Fixed playback.\n\nAdded tests.')).toBe('Fixed playback.\n\nAdded tests.')
  })

  it('collapses the blank-line runs left behind by removed tags', () => {
    expect(normalizeReleaseNotes('one\n\n\n\n\ntwo')).toBe('one\n\ntwo')
  })

  it('returns null for missing or empty notes', () => {
    expect(releaseNotesToText(null)).toBeNull()
    expect(releaseNotesToText(undefined)).toBeNull()
    expect(releaseNotesToText('')).toBeNull()
    expect(releaseNotesToText('   \n  ')).toBeNull()
  })

  it('joins per-version notes and skips empty entries', () => {
    expect(
      releaseNotesToText([
        { note: 'Second version notes' },
        { note: null },
        { note: 'First version notes' }
      ])
    ).toBe('Second version notes\n\nFirst version notes')
  })

  it('bounds the text it hands to the renderer', () => {
    const long = 'x'.repeat(5000)
    expect(releaseNotesToText(long)?.length).toBe(4000)
  })
})
