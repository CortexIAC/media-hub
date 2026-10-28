import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright-core'

/**
 * Checks the two behaviours added for the "play while browsing" request:
 * 1. a video started on the Video screen keeps playing when docked elsewhere;
 * 2. the global search field returns playable YouTube results.
 *
 * The window ignores the real mouse so a person using the machine cannot
 * disturb the run; Playwright's synthetic events still reach the page.
 */

const userDataDir = await mkdtemp(join(tmpdir(), 'bunny-dock-'))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], cwd: process.cwd() })
const page = await app.firstWindow()
const consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(error.message))

const state = () =>
  page.evaluate(() => {
    const host = document.querySelector('.yt-host')
    const content = document.querySelector('.content')
    const frame = document.querySelector('.yt-frame-wrap')
    const box = frame?.getBoundingClientRect()
    return {
      eyebrow: document.querySelector('.view-eyebrow')?.textContent ?? null,
      hostClass: host?.className ?? null,
      contentClass: content?.className ?? null,
      playerState: document.querySelector('.yt-player')?.getAttribute('data-youtube-state') ?? null,
      hostCount: document.querySelectorAll('.yt-host').length,
      frame: box ? { w: Math.round(box.width), h: Math.round(box.height), x: Math.round(box.x), y: Math.round(box.y) } : null
    }
  })

const report = {}
try {
  await page.waitForSelector('.titlebar', { timeout: 60_000 })
  await page.waitForSelector('.view', { timeout: 60_000 })
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window?.setSize(1480, 940)
    window?.setIgnoreMouseEvents(true)
  })

  await page.getByRole('button', { name: 'Video', exact: true }).click()
  await page.locator('#youtube-search').fill('mari glock lil noonie')
  await page.locator('#youtube-search').press('Enter')
  await page.locator('.yt-card').first().waitFor({ timeout: 45_000 })
  report.searchResults = await page.locator('.yt-card').count()
  await page.locator('.yt-thumb').first().click()
  await page.locator('.yt-host.is-stage').waitFor({ timeout: 20_000 })
  await page.waitForFunction(
    () => document.querySelector('.yt-player')?.getAttribute('data-youtube-state') === 'playing',
    undefined,
    { timeout: 90_000 }
  )
  report.stage = await state()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'screenshots/15-youtube-stage.png' })

  await page.getByRole('button', { name: /^Music/ }).click()
  await page.locator('.yt-host.is-dock').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(2500)
  report.docked = await state()
  await page.screenshot({ path: 'screenshots/16-youtube-dock.png' })

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.minimize())
  await page.waitForTimeout(2000)
  report.minimised = {
    visibility: await page.evaluate(() => document.visibilityState),
    playerState: await page.locator('.yt-player').getAttribute('data-youtube-state')
  }
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window?.restore()
    window?.setIgnoreMouseEvents(true)
  })
  await page.waitForTimeout(800)

  await page.locator('#global-search').fill('mari glock')
  await page.locator('.view .section .yt-card').first().waitFor({ timeout: 45_000 })
  await page.waitForTimeout(1200)
  report.search = await state()
  report.searchCards = await page.locator('.view .section .yt-card').count()
  await page.screenshot({ path: 'screenshots/17-search-youtube.png' })
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error)
  await page.screenshot({ path: 'screenshots/dock-failure.png' }).catch(() => undefined)
} finally {
  report.consoleErrors = consoleErrors.filter((text) => !text.includes('doubleclick')).slice(0, 4)
  console.log(JSON.stringify(report, null, 2))
  await app.close()
}
