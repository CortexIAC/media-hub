/// <reference lib="dom" />
import { promises as fs } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication, type Locator, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createFixtureLibrary, type FixtureLibrary } from '../helpers/audio-fixtures'

/**
 * End-to-end verification of the real Electron application: startup, folder
 * import, playback through the Chromium audio pipeline, transport, queue,
 * favorites, playlists, persistence across a restart and shutdown.
 *
 * Run with `npm run test:e2e` (builds first). Screenshots are written to
 * ./screenshots for the Sprint 1 report.
 */

const projectRoot = process.cwd()
const screenshotDir = join(projectRoot, 'screenshots')
const fixtureRoot = join(projectRoot, 'fixtures', 'library')

let app: ElectronApplication
let page: Page
let fixtures: FixtureLibrary
let userDataDir: string
const pageErrors: string[] = []
const consoleErrors: string[] = []
const mediaRequests: string[] = []

async function launch(): Promise<void> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`],
    cwd: projectRoot,
    env
  })
  page = await app.firstWindow()
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('request', (request) => {
    if (request.url().startsWith('bunny-media://')) mediaRequests.push(request.url())
  })
  await page.waitForSelector('.titlebar', { timeout: 60_000 })
  await page.waitForSelector('.view', { timeout: 60_000 })
  // Keep the window foregrounded: Chromium throttles rendering for occluded
  // windows, which makes Playwright's stability checks time out at random.
  await page.bringToFront()
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    window?.setSize(1480, 940)
  })
  await page.waitForTimeout(400)
}

async function clearToasts(): Promise<void> {
  const dismiss = page.locator('.toast button[aria-label="Dismiss"]')
  const count = await dismiss.count()
  for (let index = 0; index < count; index += 1) {
    await dismiss.nth(index).click({ timeout: 1000 }).catch(() => undefined)
  }
}

async function shot(name: string): Promise<void> {
  await page.waitForTimeout(260)
  await clearToasts()
  await page.waitForTimeout(200)
  // Disabling animations makes the capture deterministic instead of catching a
  // 160ms view fade at 40% opacity.
  await page.screenshot({ path: join(screenshotDir, name), animations: 'disabled' })
}

async function waitForText(locator: Locator, expected: string, timeout = 20_000): Promise<void> {
  await expect.poll(async () => (await locator.innerText()).trim(), { timeout }).toBe(expected)
}

function secondsOf(label: string): number {
  const [minutes, seconds] = label.split(':').map((part) => Number(part))
  return (minutes ?? 0) * 60 + (seconds ?? 0)
}

/** Range inputs ignore fill(); drive them the way a keyboard/pointer would. */
async function setRange(locator: Locator, value: number): Promise<void> {
  await locator.evaluate((element, next) => {
    const input = element as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, String(next))
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

function nav(name: string | RegExp): Locator {
  return page.locator('.sidebar').getByRole('button', { name })
}

function playerButton(name: string): Locator {
  return page.locator('.playerbar').getByRole('button', { name, exact: true })
}

beforeAll(async () => {
  await fs.mkdir(screenshotDir, { recursive: true })
  await fs.rm(fixtureRoot, { recursive: true, force: true })
  fixtures = await createFixtureLibrary(fixtureRoot)
  userDataDir = await mkdtemp(join(tmpdir(), 'bunny-e2e-userdata-'))
  await launch()
})

afterAll(async () => {
  if (app) await app.close().catch(() => undefined)
  // Fixtures are intentionally kept in ./fixtures/library so the running app
  // can be inspected by hand after a test run. They are regenerated each time
  // and ignored by git.
})

describe('Bunny Media Hub end-to-end', () => {
  it('launches with an empty, honest library state', async () => {
    const info = await page.evaluate(() => window.bunny.app.info())
    expect(info.name).toBe('Bunny Media Hub')
    expect(info.dataDir.toLowerCase()).toContain(userDataDir.toLowerCase().replace(/\\/g, '\\'))
    await page.locator('.empty-state').waitFor()
    await waitForText(page.locator('.empty-state h2'), 'Your music library is empty')
    await shot('01-empty-library.png')
  })

  it('imports a folder, scans it and shows the discovered music', async () => {
    await app.evaluate(({ dialog }, folder) => {
      // Native dialogs cannot be driven by Playwright; stub the picker for the
      // test only. Everything after the picker is real.
      ;(dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folder]
      })
    }, fixtures.root)

    await page.getByRole('button', { name: 'Import a music folder' }).click()
    await page.getByText('Opening Tone', { exact: true }).first().waitFor({ timeout: 90_000 })
    await page.waitForTimeout(600)

    const trackRows = await page.locator('.track-row').count()
    expect(trackRows).toBeGreaterThan(0)
    await page.getByText('Artwork Sessions', { exact: true }).first().waitFor()
    await shot('02-music-library.png')
  })

  it('plays real audio and supports transport controls', async () => {
    await page.getByRole('button', { name: 'Open album Artwork Sessions' }).first().click()
    await page.locator('.album-hero').waitFor()
    await shot('03-album.png')

    await page.locator('.album-hero').getByRole('button', { name: 'Play', exact: true }).click()
    await waitForText(page.locator('.now-mini-title'), 'Cover Tone')

    const position = page.locator('.seek-row .time').first()
    await waitForText(page.locator('.seek-row .time').last(), '0:12', 10_000)
    await expect.poll(async () => position.innerText(), { timeout: 20_000 }).not.toBe('0:00')

    // Playback position only advances when Chromium is decoding the stream.
    const advanced = await position.innerText()
    expect(advanced).toMatch(/^0:0[12]$/)
    expect(mediaRequests.some((url) => url.startsWith('bunny-media://track/'))).toBe(true)

    await playerButton('Pause').click()
    await playerButton('Play').waitFor({ timeout: 5000 })
    await page.waitForTimeout(350)
    const pausedAt = secondsOf(await position.innerText())
    await page.waitForTimeout(1200)
    // One late `timeupdate` can land right after the pause event; allow a
    // single second of rounding rather than flaking on it.
    expect(Math.abs(secondsOf(await position.innerText()) - pausedAt)).toBeLessThanOrEqual(1)

    const seek = page.locator('.playerbar input[aria-label="Seek"]')
    await seek.focus()
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(400)

    await playerButton('Play').click()
    await playerButton('Next track').click()
    await waitForText(page.locator('.now-mini-title'), 'Second Tone')

    await playerButton('Previous track').click()
    await waitForText(page.locator('.now-mini-title'), 'Cover Tone')

    await page.locator('.now-mini').click()
    await page.locator('.now-playing').waitFor()
    // Cover Tone carries embedded USLT lyrics, which must render without any
    // network request.
    await page.locator('.lyric-line').first().waitFor({ timeout: 10_000 })
    expect(await page.locator('.np-lyrics').innerText()).toContain('Embedded line one')
    await shot('04-now-playing.png')
  })

  it('plays a FLAC file through the same pipeline', async () => {
    await nav(/^Music/).click()
    await page.getByRole('button', { name: 'Play Lossless Field' }).first().click()
    await waitForText(page.locator('.now-mini-title'), 'Lossless Field')

    const position = page.locator('.seek-row .time').first()
    await expect.poll(async () => position.innerText(), { timeout: 20_000 }).not.toBe('0:00')
    expect(await position.innerText()).toMatch(/^0:0[12]$/)
    expect(await page.locator('.now-mini-sub').innerText()).toContain('Neon Cartography')
    expect(await page.locator('.toast').count()).toBe(0)

    await playerButton('Pause').click()
    await playerButton('Play').waitFor({ timeout: 5000 })
  })

  it('applies an equalizer preset without interrupting playback', async () => {
    // Capture the AudioContext the player creates so the test can prove it is
    // running, can reproduce Chromium suspending it while paused, and can
    // measure whether samples actually reach the output.
    await page.evaluate(() => {
      const holder = window as unknown as {
        __contexts?: AudioContext[]
        __output?: { analyser: AnalyserNode }
        AudioContext: typeof AudioContext
      }
      holder.__contexts = []
      holder.__output = undefined
      const Original = holder.AudioContext
      class Tracked extends Original {
        constructor(options?: AudioContextOptions) {
          super(options)
          holder.__contexts?.push(this)
        }
      }
      holder.AudioContext = Tracked as unknown as typeof AudioContext

      // Tap whatever the player connects to the speakers, so the test can prove
      // audio is audible instead of merely that a graph exists.
      const nativeConnect = AudioNode.prototype.connect
      AudioNode.prototype.connect = function (this: AudioNode, destination: AudioNode, ...rest: unknown[]) {
        if (destination === this.context.destination && !holder.__output) {
          const analyser = this.context.createAnalyser()
          analyser.fftSize = 2048
          ;(nativeConnect as unknown as (this: AudioNode, node: AudioNode) => AudioNode).call(analyser, destination)
          holder.__output = { analyser }
          return (nativeConnect as unknown as (this: AudioNode, node: AudioNode, ...args: unknown[]) => AudioNode).call(
            this,
            analyser,
            ...rest
          )
        }
        return (nativeConnect as unknown as (this: AudioNode, node: AudioNode, ...args: unknown[]) => AudioNode).call(
          this,
          destination,
          ...rest
        )
      } as typeof AudioNode.prototype.connect
    })

    await nav('Settings').click()
    await page.getByRole('heading', { name: 'Equalizer' }).waitFor()
    await page.getByRole('button', { name: 'Bass boost' }).click()
    await page.locator('.eq-bands').scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    const bands = await page.locator('.eq-bands input[type="range"]').count()
    expect(bands).toBe(5)

    // The new sliders: extra bass and output boost.
    await setRange(page.getByLabel('Extra bass boost'), 6)
    await setRange(page.getByLabel('Audio boost'), 150)
    await page.waitForTimeout(150)
    await shot('12-equalizer.png')

    await nav(/^Music/).click()
    await page.getByRole('button', { name: 'Play Opening Tone' }).first().click()
    await waitForText(page.locator('.now-mini-title'), 'Opening Tone')
    const position = page.locator('.seek-row .time').first()
    await expect.poll(async () => position.innerText(), { timeout: 20_000 }).not.toBe('0:00')

    // The graph exists and runs while audio plays.
    const running = await page.evaluate(() => {
      const contexts = (window as unknown as { __contexts?: AudioContext[] }).__contexts ?? []
      return contexts.map((context) => context.state)
    })
    expect(running.length).toBeGreaterThan(0)
    expect(running.every((state) => state === 'running')).toBe(true)

    // Regression: a MediaElementAudioSourceNode fed by a cross-origin resource
    // outputs pure silence, so an uncorsed media scheme made the equalizer mute
    // every track while the clock kept running. Real samples must reach the
    // destination.
    const outputPeak = await page.evaluate(async () => {
      const analyser = (window as unknown as { __output?: { analyser: AnalyserNode } }).__output?.analyser
      if (!analyser) return 0
      const buffer = new Float32Array(analyser.fftSize)
      let peak = 0
      for (let index = 0; index < 15; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        analyser.getFloatTimeDomainData(buffer)
        for (const value of buffer) peak = Math.max(peak, Math.abs(value))
      }
      return peak
    })
    expect(outputPeak).toBeGreaterThan(0.001)

    await playerButton('Pause').click()
    await playerButton('Play').waitFor({ timeout: 5000 })

    // Regression: Chromium suspends an idle AudioContext. Pausing, suspending
    // the context, then pressing play must resume it instead of staying silent.
    await page.evaluate(async () => {
      const contexts = (window as unknown as { __contexts?: AudioContext[] }).__contexts ?? []
      await contexts[0]?.suspend()
    })
    await playerButton('Play').click()
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const contexts = (window as unknown as { __contexts?: AudioContext[] }).__contexts ?? []
            return contexts[0]?.state ?? 'missing'
          }),
        { timeout: 8000 }
      )
      .toBe('running')
    await playerButton('Pause').click()
  })

  it('opens the Virtual Library and searches public catalogues', async () => {
    await nav('Virtual Library').click()
    await page.getByRole('heading', { name: 'Virtual Library' }).waitFor()
    await page.getByText('Open Library', { exact: true }).first().waitFor()

    // Live network access is not guaranteed in CI, so this asserts the request
    // path and either a result list or the honest failure message.
    await page.getByLabel('Search online catalogues').fill('sherlock holmes')
    await expect
      .poll(
        async () =>
          (await page.locator('.discovery-row').count()) +
          (await page.getByText(/no catalogue results/i).count()) +
          (await page.getByText(/catalogue search failed/i).count()),
        { timeout: 30_000 }
      )
      .toBeGreaterThan(0)
    await shot('13-virtual-library.png')
    await page.getByLabel('Search online catalogues').fill('')
  })

  it('supports queue, favorites, playlists, search and the planned screens', async () => {
    await playerButton('Queue').click()
    await page.locator('.queue-panel').waitFor()
    await shot('05-queue.png')
    await page.getByRole('button', { name: 'Close queue' }).click()

    // Favorite a known track from its row.
    await nav(/^Music/).click()
    await page.getByRole('button', { name: 'Favorite Cover Tone' }).click()
    await page.waitForTimeout(300)

    // Create a playlist from the sidebar.
    await nav('New playlist').click()
    await page.getByPlaceholder('Playlist name').fill('Late Night Tests')
    await page.getByRole('button', { name: 'Create', exact: true }).click()
    await page.locator('.view-eyebrow', { hasText: 'Playlist' }).waitFor()
    await nav(/^Late Night Tests/).waitFor()
    await shot('06-playlist.png')

    // Add a track through the row menu.
    await nav(/^Music/).click()
    await page.getByRole('button', { name: 'More actions for Opening Tone' }).first().click()
    await page.locator('.dropdown').waitFor({ timeout: 5000 })
    const menuText = await page.locator('.dropdown').innerText()
    expect(menuText).toContain('Late Night Tests')
    await page.getByRole('menuitem', { name: 'Late Night Tests' }).click()
    await page.waitForTimeout(500)
    await nav(/^Late Night Tests/).click()
    await page.getByText('Opening Tone', { exact: true }).first().waitFor()

    // Favorites view.
    await nav(/^Favorites/).click()
    await page.getByText('Cover Tone', { exact: true }).first().waitFor()

    // Search.
    await page.locator('#global-search').fill('night')
    await page.getByText('Midnight Signal', { exact: true }).first().waitFor()
    await shot('07-search.png')

    // Library management.
    await nav(/^Library/).click()
    await page.getByText('Music folders').waitFor()
    await shot('08-library.png')

    // Streams lists the curated public sources plus the provider contracts.
    await nav('Streams').click()
    await page.getByText('Your streams').waitFor()
    await page.getByText('YouTube', { exact: true }).waitFor()
    await shot('09-streams.png')

    await nav('Devices').click()
    await page.getByText('Designed layers').waitFor()

    // Settings and a theme token change.
    await nav('Settings').click()
    await page.getByText('Supported audio').waitFor()
    await page.getByRole('button', { name: 'Accent Mint' }).click()
    await page.waitForTimeout(300)
    const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())
    expect(accent.toLowerCase()).toBe('#5ee6c2')
    await shot('10-settings.png')
  })

  it('restores the library, favorites, playlist and paused track after a restart', async () => {
    await nav(/^Favorites/).click()
    await page.getByText('Cover Tone', { exact: true }).first().waitFor()

    // Pause first so the saved position is stable, then let the session saver
    // run its 5s interval before shutdown.
    const pause = playerButton('Pause')
    if ((await pause.count()) > 0) await pause.click()
    await page.waitForTimeout(5500)
    const savedTitle = (await page.locator('.now-mini-title').innerText()).trim()
    const savedTime = (await page.locator('.seek-row .time').first().innerText()).trim()
    expect(savedTitle.length).toBeGreaterThan(0)
    await app.close()

    for (const file of ['library.json', 'playlists.json', 'session.json', 'settings.json']) {
      const stat = await fs.stat(join(userDataDir, file))
      expect(stat.size).toBeGreaterThan(2)
    }

    const savedSettings = JSON.parse(await fs.readFile(join(userDataDir, 'settings.json'), 'utf8')) as {
      equalizer?: { enabled: boolean; bands: number[]; boost?: number; bassBoost?: number }
    }
    expect(savedSettings.equalizer?.enabled).toBe(true)
    expect(savedSettings.equalizer?.bands).toEqual([7, 5, 0, -1, -1])
    expect(savedSettings.equalizer?.bassBoost).toBe(6)
    expect(savedSettings.equalizer?.boost).toBe(1.5)

    await launch()
    await page.locator('.sidebar').waitFor()
    const info = await page.evaluate(() => window.bunny.app.info())
    expect(info.dataDir.toLowerCase()).toContain(userDataDir.toLowerCase())

    await nav(/^Library/).click()
    await page.getByText('Music folders').waitFor()
    const folderRows = await page.locator('.folder-row').count()
    expect(folderRows).toBe(1)

    await nav(/^Music/).click()
    await page.getByText('Opening Tone', { exact: true }).first().waitFor()
    await nav(/^Late Night Tests/).waitFor()

    // The previous track comes back paused at its saved position.
    await waitForText(page.locator('.now-mini-title'), savedTitle)
    await waitForText(page.locator('.seek-row .time').first(), savedTime)
    await playerButton('Play').waitFor()

    const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())
    expect(accent.toLowerCase()).toBe('#5ee6c2')
    await shot('11-restored-library.png')
  })

  it('shuts down cleanly and reports no page errors', async () => {
    await app.close()
    expect(pageErrors).toEqual([])
    expect(consoleErrors.filter((message) => !message.includes('Autofill'))).toEqual([])
  })
})
