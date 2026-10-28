import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright-core'

/**
 * Live check for the Internet Archive tab.
 *
 * Talks to the real archive.org APIs and streams a real episode through the
 * app's proxy, because parsing fixtures alone would not prove that a saved show
 * actually plays. Verifies:
 *
 * 1. browsing and searching return genuine items,
 * 2. a multi-file show lists labelled, ordered episodes (S01E01…),
 * 3. saving puts it in Shows, and the library survives a restart,
 * 4. an episode reaches a real playing state,
 * 5. an attached .srt becomes a WebVTT track with cues the video can show.
 *
 * Run with `npm run build && node scripts/check-archive.mjs`.
 */

const projectRoot = process.cwd()
const screenshotDir = join(projectRoot, 'screenshots')
const fixture = join(projectRoot, 'fixtures', 'archive', 'sample.srt')
const userDataDir = await mkdtemp(join(tmpdir(), 'bunny-archive-'))

const checks = []
const failures = []
const consoleErrors = []

function check(name, condition, detail = '') {
  checks.push({ name, ok: Boolean(condition), detail })
  if (!condition) failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

async function launch() {
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], cwd: projectRoot })
  const page = await app.firstWindow()
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))
  await page.waitForSelector('.titlebar', { timeout: 60_000 })
  await page.waitForSelector('.view', { timeout: 60_000 })
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window?.setSize(1480, 940)
    // Keep a person using the machine from disturbing the run; synthetic input
    // from Playwright is delivered regardless.
    window?.setIgnoreMouseEvents(true)
  })
  const timeOrigin = await page.evaluate(() => performance.timeOrigin)
  return { app, page, timeOrigin }
}

async function openArchive(page) {
  await page.getByRole('button', { name: 'Archive', exact: true }).click()
  await page.waitForSelector('.archive-tabs', { timeout: 20_000 })
}

async function submitSearch(page, query) {
  await page.locator('#archive-search').fill(query)
  await page.locator('#archive-search').press('Enter')
  // The heading updates as soon as the field changes; the results arrive after
  // the request. Wait for the button to leave its "Searching…" state instead.
  await page.waitForTimeout(120)
  await page.waitForFunction(
    () => {
      const button = document.querySelector('.archive-search button[type=submit]')
      return Boolean(button) && !(button?.textContent ?? '').includes('Searching')
    },
    undefined,
    { timeout: 60_000 }
  )
  await page.waitForFunction(
    (text) => (document.querySelector('.section-header h2')?.textContent ?? '').toLowerCase().includes(text),
    query.toLowerCase(),
    { timeout: 30_000 }
  )
}

async function waitForVideoPlaying(page, timeout = 120_000) {
  await page.waitForSelector('.stream-host.is-stage video', { timeout: 60_000 })
  await page.waitForFunction(
    () => {
      const video = document.querySelector('.stream-host video')
      return video instanceof HTMLVideoElement && video.currentTime > 1.5 && !video.paused
    },
    undefined,
    { timeout }
  )
  return page.evaluate(() => {
    const video = document.querySelector('.stream-host video')
    if (!(video instanceof HTMLVideoElement)) return null
    return {
      time: Number(video.currentTime.toFixed(2)),
      duration: Number.isFinite(video.duration) ? Number(video.duration.toFixed(1)) : null,
      width: video.videoWidth,
      height: video.videoHeight,
      tracks: video.textTracks.length
    }
  })
}

const report = {}
let app
let page

try {
  const first = await launch()
  ;({ app, page } = first)
  report.firstTimeOrigin = first.timeOrigin
  await openArchive(page)

  // --- 1. Browse the default shelf --------------------------------------
  await page.waitForSelector('.archive-card', { timeout: 90_000 })
  await page.waitForTimeout(1200) // let posters settle for the screenshot
  report.browseCount = await page.locator('.archive-card').count()
  report.browseFirst = await page.locator('.archive-card-title').first().innerText()
  check('Browsing the cartoon shelf returns items', report.browseCount >= 8, `${report.browseCount} cards`)
  await page
    .waitForFunction(
      () => {
        const image = document.querySelector('.archive-poster img')
        return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
      },
      undefined,
      { timeout: 30_000 }
    )
    .catch(() => undefined)
  check(
    'Poster images resolve through the app scheme',
    await page.evaluate(() => {
      const image = document.querySelector('.archive-poster img')
      return image instanceof HTMLImageElement ? image.complete && image.naturalWidth > 0 : false
    })
  )
  await page.screenshot({ path: join(screenshotDir, '19-archive-discover.png') })

  // --- 2. Search --------------------------------------------------------
  await submitSearch(page, 'angelina ballerina')
  report.angelinaCount = await page.locator('.archive-card').count()
  report.angelinaFirst = await page.locator('.archive-card-title').first().innerText()
  check(
    'A cartoon outside the animation collection is still found',
    report.angelinaCount > 0 && /angelina/i.test(report.angelinaFirst),
    `${report.angelinaCount} results, first: ${report.angelinaFirst}`
  )
  check(
    'A thin collection search is widened and says so',
    (await page.locator('.archive-banner.is-info').count()) === 1 &&
      (await page.locator('.archive-tab').count()) === 3,
    'widened banner'
  )

  await submitSearch(page, 'barney')
  report.barneyCount = await page.locator('.archive-card').count()
  report.barneyFirst = await page.locator('.archive-card-title').first().innerText()
  check('Searching “barney” returns genuine archive.org items', report.barneyCount > 0, `${report.barneyCount} results`)
  check('The closest title is ranked first', /barney/i.test(report.barneyFirst), report.barneyFirst)

  // --- 3. Open a series with numbered episode files ----------------------
  await submitSearch(page, 'tower prep')
  const tower = page.locator('.archive-card', { hasText: 'Tower Prep' }).first()
  await tower.waitFor({ timeout: 60_000 })
  await tower.click()
  await page.waitForSelector('.archive-episode', { timeout: 90_000 })

  report.episodeCount = await page.locator('.archive-episode').count()
  report.labels = (await page.locator('.archive-episode-label').allInnerTexts()).slice(0, 3)
  report.detailMeta = await page.locator('.archive-detail-meta').innerText()
  check('Episodes are split into individual, labelled entries', report.episodeCount >= 10, `${report.episodeCount} episodes`)
  check('Episode labels carry season and episode numbers', /^S01E01 . New Kid/.test(report.labels[0] ?? ''), report.labels[0])
  check(
    'Episode metadata includes duration and size',
    /\d+:\d{2}/.test(await page.locator('.archive-episode-meta').first().innerText()),
    await page.locator('.archive-episode-meta').first().innerText()
  )
  check('Rights are stated before saving', (await page.locator('.archive-rights').innerText()).length > 10)
  await page
    .waitForFunction(
      () => {
        const image = document.querySelector('.archive-poster.is-large img')
        return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
      },
      undefined,
      { timeout: 20_000 }
    )
    .catch(() => undefined)
  await page.screenshot({ path: join(screenshotDir, '20-archive-detail.png') })

  // --- 4. Save to Shows --------------------------------------------------
  await page.getByRole('button', { name: /Save to Shows/ }).click()
  await page.getByRole('button', { name: /Remove from library/ }).waitFor({ timeout: 20_000 })
  check(
    'Saving marks the title as part of the library',
    (await page.locator('.archive-actions').innerText()).includes('Remove from library')
  )

  // --- 5. Attach a subtitle file ----------------------------------------
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
  }, fixture)
  await page.locator('.archive-episode').first().getByRole('button', { name: /Add subs/ }).click()
  await page.locator('.archive-cc.is-attached').first().waitFor({ timeout: 20_000 })
  check('An attached SubRip file is accepted', (await page.locator('.archive-cc.is-attached').count()) === 1)
  await page.waitForTimeout(400)

  // --- 6. Play the episode for real --------------------------------------
  await page.locator('.archive-episode-play').first().click()
  report.playback = await waitForVideoPlaying(page)
  check('The episode reaches a real playing state', (report.playback?.time ?? 0) >= 1.5, JSON.stringify(report.playback))
  check('Video dimensions are real', (report.playback?.width ?? 0) > 0, `${report.playback?.width}x${report.playback?.height}`)
  check(
    'The player stays on the Archive screen',
    (await page.locator('.stream-host').getAttribute('class'))?.includes('is-stage') === true
  )
  check('The dock title names the episode', (await page.locator('.stream-stage-title').innerText()).includes('S01E01'))

  // --- 7. Captions load as a WebVTT track --------------------------------
  await page.evaluate(() => {
    const video = document.querySelector('.stream-host video')
    if (video instanceof HTMLVideoElement && video.textTracks[0]) video.textTracks[0].mode = 'showing'
  })
  await page.waitForFunction(
    () => {
      const video = document.querySelector('.stream-host video')
      if (!(video instanceof HTMLVideoElement)) return false
      const track = video.textTracks[0]
      return Boolean(track && track.cues && track.cues.length > 0)
    },
    undefined,
    { timeout: 30_000 }
  )
  report.captions = await page.evaluate(() => {
    const video = document.querySelector('.stream-host video')
    if (!(video instanceof HTMLVideoElement)) return null
    const track = video.textTracks[0]
    return {
      count: video.textTracks.length,
      label: track?.label ?? null,
      cues: track?.cues?.length ?? 0,
      firstCue: track?.cues?.[0]?.text ?? null,
      mode: track?.mode ?? null
    }
  })
  check('Subtitles load with cues', (report.captions?.cues ?? 0) >= 2, JSON.stringify(report.captions))
  check('The attached file is the caption source', (report.captions?.firstCue ?? '').includes('Bunny Media Hub'))
  // Let the save/attach toasts clear so the screenshot shows the player itself.
  await page
    .waitForFunction(() => document.querySelectorAll('.toast').length === 0, undefined, { timeout: 20_000 })
    .catch(() => undefined)
  await page.screenshot({ path: join(screenshotDir, '21-archive-playing.png') })

  // --- 8. Persistence across a restart -----------------------------------
  await app.close()
  app = null
  const second = await launch()
  ;({ app, page } = second)
  report.secondTimeOrigin = second.timeOrigin
  await openArchive(page)
  // A fresh renderer cannot still be showing the previous session's toasts.
  check('The app actually restarted', second.timeOrigin !== (report.firstTimeOrigin ?? 0), `${report.firstTimeOrigin} → ${second.timeOrigin}`)
  check('No stale toasts survive the restart', (await page.locator('.toast').count()) === 0)
  await page.getByRole('tab', { name: /Shows/ }).click()
  await page.waitForSelector('.archive-card', { timeout: 30_000 })
  report.savedAfterRestart = await page.locator('.archive-card-title').allInnerTexts()
  check(
    'The saved show survives a restart',
    report.savedAfterRestart.some((title) => title.includes('Tower Prep')),
    report.savedAfterRestart.join(' | ')
  )
  check(
    'The saved card reports its episode count',
    (await page.locator('.archive-poster-tag').first().innerText()).includes('eps')
  )
  await page.screenshot({ path: join(screenshotDir, '22-archive-shows.png') })
  await page.locator('.archive-card', { hasText: 'Tower Prep' }).first().click()
  await page.waitForSelector('.archive-cc.is-attached', { timeout: 30_000 })
  check('The attached subtitle survives a restart', (await page.locator('.archive-cc.is-attached').count()) === 1)
} catch (error) {
  failures.push(`threw: ${error instanceof Error ? error.message : String(error)}`)
  if (page) {
    await page.screenshot({ path: join(screenshotDir, '19-archive-debug.png') }).catch(() => undefined)
  }
} finally {
  if (app) await app.close().catch(() => undefined)
}

report.consoleErrors = consoleErrors.slice(0, 10)
report.checks = checks

console.log(JSON.stringify(report, null, 2))
console.log('')
for (const entry of checks) {
  console.log(`${entry.ok ? 'PASS' : 'FAIL'}  ${entry.name}${entry.ok || !entry.detail ? '' : `  (${entry.detail})`}`)
}
if (consoleErrors.length > 0) {
  console.log('')
  console.log('Console errors:')
  for (const error of consoleErrors.slice(0, 8)) console.log(`  ${error}`)
}
if (failures.length > 0) {
  console.log('')
  console.log(`${failures.length} failed:`)
  for (const failure of failures) console.log(`  ${failure}`)
  process.exitCode = 1
} else {
  console.log('')
  console.log(`${checks.length}/${checks.length} checks passed`)
}
