import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright-core'

/**
 * End-to-end check for the YouTube pipeline, with no API key configured:
 * search → real results → select → the official player reaches its playing
 * state. Run with: node scripts/check-youtube.mjs (after `npm run build`).
 */

const root = process.cwd()
const userDataDir = await mkdtemp(join(tmpdir(), 'bunny-yt-'))
const env = {}
for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v

const app = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], cwd: root, env })
const page = await app.firstWindow()
await page.waitForSelector('.view', { timeout: 60_000 })
await page.bringToFront()
const errors = []
page.on('pageerror', (e) => errors.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

await page.locator('.sidebar').getByRole('button', { name: 'Video' }).click()
await page.getByRole('heading', { name: 'Video' }).waitFor()

// ---- keyless search -------------------------------------------------------
const searchInput = page.getByLabel('Search YouTube')
await searchInput.fill('mari glock lil noonie')
await page.getByRole('button', { name: /^Search$/ }).click()
await page.locator('.yt-card').first().waitFor({ timeout: 30_000 })

const cards = await page.locator('.yt-card').count()
const titles = await page.locator('.yt-card-title').allInnerTexts()
console.log('keyless search cards:', cards)
console.log('first titles:', titles.slice(0, 5))
console.log('warning:', (await page.locator('.faint').allInnerTexts()).filter((t) => /YouTube|API key/.test(t)).slice(0, 2))

if (cards === 0) {
  console.log('FAIL: no search results')
  await app.close()
  process.exit(1)
}

// ---- playback -------------------------------------------------------------
await page.locator('.yt-card').first().getByRole('button', { name: 'Play', exact: true }).click()

let state = 'unknown'
for (let i = 0; i < 45; i += 1) {
  state = await page.locator('.yt-player').getAttribute('data-youtube-state')
  if (state === 'playing') break
  if (state === 'cued' && i === 4) await page.getByRole('button', { name: 'Play video' }).click().catch(() => undefined)
  await page.waitForTimeout(1000)
}

const iframes = await page.evaluate(() => [...document.querySelectorAll('iframe')].map((frame) => frame.src))
const timeText = await page.locator('.yt-controls .time').allInnerTexts().catch(() => [])

console.log('player state:', state)
console.log('player times:', timeText)
console.log('iframe src:', iframes[0] ?? '(none)')
console.log('now playing:', (await page.locator('.yt-now').innerText().catch(() => '')).replace(/\n/g, ' | '))
console.log('console errors:', errors.slice(0, 5))

await page.screenshot({ path: 'screenshots/14-youtube.png' })
await app.close()

if (state !== 'playing') {
  console.log('FAIL: player never reached the playing state')
  process.exit(1)
}
console.log('PASS: search returned results and the embedded player is playing')
