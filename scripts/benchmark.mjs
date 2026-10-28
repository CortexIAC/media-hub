import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright-core'
import { makeWav } from '../tests/helpers/audio-fixtures.ts'

/**
 * Measures the two numbers the Sprint 1 brief asks for: cold start time, and
 * how a large import behaves while the scanner runs on its worker thread.
 *
 * Usage: npm run bench -- [trackCount]
 * Results are printed as JSON and also written to benchmarks/last-run.json.
 */

const trackCount = Number(process.argv[2] ?? 300)
const projectRoot = process.cwd()
const fixtureRoot = join(projectRoot, 'fixtures', 'benchmark-library')
const resultDir = join(projectRoot, 'benchmarks')

const env = {}
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined) env[key] = value
}

await mkdir(resultDir, { recursive: true })
await rm(fixtureRoot, { recursive: true, force: true })

const albums = 10
const perAlbum = Math.ceil(trackCount / albums)
console.log(`Generating ${trackCount} WAV files in ${fixtureRoot} …`)
for (let album = 0; album < albums; album += 1) {
  const dir = join(fixtureRoot, `Bench Album ${album + 1}`)
  await mkdir(dir, { recursive: true })
  const writes = []
  for (let track = 0; track < perAlbum; track += 1) {
    const index = album * perAlbum + track
    if (index >= trackCount) break
    const name = `${String(track + 1).padStart(2, '0')} Bench Track ${index + 1}.wav`
    writes.push(
      writeFile(
        join(dir, name),
        makeWav({
          durationSeconds: 1,
          frequency: 220 + (index % 24) * 12,
          tags: {
            title: `Bench Track ${index + 1}`,
            artist: `Bench Artist ${(index % 7) + 1}`,
            album: `Bench Album ${album + 1}`,
            track: String(track + 1)
          }
        })
      )
    )
  }
  await Promise.all(writes)
}

const userDataDir = await mkdtemp(join(tmpdir(), 'bunny-bench-userdata-'))

const startedAt = Date.now()
const app = await electron.launch({
  args: ['.', `--user-data-dir=${userDataDir}`],
  cwd: projectRoot,
  env
})
const page = await app.firstWindow()
await page.waitForSelector('.view', { timeout: 60_000 })
const startupMs = Date.now() - startedAt

// Sample animation-frame deltas from inside the renderer for the whole import:
// a frozen UI shows up as one very long gap.
await page.evaluate(() => {
  window.__frameGaps = []
  window.__longTasks = []
  let last = performance.now()
  const tick = (now) => {
    window.__frameGaps.push({ end: Math.round(now), gap: Math.round(now - last) })
    last = now
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__longTasks.push({ start: Math.round(entry.startTime), duration: Math.round(entry.duration) })
      }
    }).observe({ entryTypes: ['longtask'] })
  } catch {
    // longtask is Chromium-only; the frame-gap sampling above still works.
  }
})

await app.evaluate(({ dialog }, folder) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] })
}, fixtureRoot)

// Keep the window foreground so Chromium's occlusion throttling does not show
// up in the frame timings as a fake stall.
await page.bringToFront()
await page.waitForTimeout(300)

const importStartedAt = Date.now()
await page.evaluate(() => {
  window.__importMark = performance.now()
})
await page.getByRole('button', { name: 'Import a music folder' }).click()
await page.waitForSelector('.scan-banner', { timeout: 60_000 })
await page.waitForSelector('.scan-banner', { state: 'detached', timeout: 300_000 })

const subtitle = await page.locator('.view-subtitle').innerText()
await page.waitForFunction(() => document.querySelectorAll('.track-row').length > 0, undefined, {
  timeout: 120_000
})
const importMs = Date.now() - importStartedAt

const rawGaps = await page.evaluate(() => window.__frameGaps ?? [])
const gaps = rawGaps.map((sample) => sample.gap)
const gapTimeline = await page.evaluate(() =>
  (window.__frameGaps ?? [])
    .filter((sample) => sample.gap > 120)
    .map((sample) => ({ offsetMs: Math.round(sample.end - window.__importMark), gapMs: sample.gap }))
)
const longTasks = await page.evaluate(() =>
  (window.__longTasks ?? []).map((task) => ({
    offsetMs: Math.round(task.start - window.__importMark),
    durationMs: task.duration
  }))
)
const sorted = [...gaps].sort((a, b) => a - b)
const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0
const longGaps = gaps.filter((gap) => gap > 120)

const result = {
  tracks: trackCount,
  startupMs,
  importMs,
  scanMsPerTrack: Math.round(importMs / trackCount),
  frames: gaps.length,
  frameGapP50: percentile(0.5),
  frameGapP95: percentile(0.95),
  frameGapP99: percentile(0.99),
  frameGapMax: Math.max(...gaps),
  framesOver120ms: longGaps.length,
  longestGapMs: Math.max(...gaps),
  longTasks,
  gapTimeline,
  subtitle
}

await app.close()
await writeFile(join(resultDir, 'last-run.json'), JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
