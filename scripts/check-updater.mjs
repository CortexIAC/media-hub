import { existsSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright-core'

/**
 * Live check for the packaged app's updater.
 *
 * Drives the built, installed-shaped app (release/win-unpacked) through the real
 * Settings → Updates panel and the real GitHub feed. Nothing is stubbed: the
 * check reads the version baked into the package, presses the same buttons a
 * person would, and asserts the status the main process reports over IPC.
 *
 *   node scripts/check-updater.mjs                       # expect up-to-date
 *   EXPECT=available DOWNLOAD=1 node scripts/check-updater.mjs
 *   EXE="/path/to/older/Bunny Media Hub.exe" EXPECT_VERSION=0.1.0 node scripts/check-updater.mjs
 *
 * Exit code is non-zero when an expectation is missed, so a silently broken
 * feed cannot be mistaken for a pass.
 */

const projectRoot = process.cwd()
const screenshotDir = join(projectRoot, 'screenshots')

const exePath = resolve(process.env.EXE ?? join(projectRoot, 'release', 'win-unpacked', 'Bunny Media Hub.exe'))
const expectedPhase = (process.env.EXPECT ?? 'up-to-date').trim()
const expectVersion = process.env.EXPECT_VERSION?.trim() ?? null
const shouldDownload = process.env.DOWNLOAD === '1'
const timeoutMs = Number(process.env.TIMEOUT_MS ?? 240_000)

const checks = []
const failures = []

function check(name, condition, detail = '') {
  checks.push({ name, ok: Boolean(condition), detail })
  if (!condition) failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

function log(message) {
  console.log(message)
}

if (!existsSync(exePath)) {
  console.error(`No packaged app at ${exePath}. Run: npm run dist`)
  process.exit(1)
}

const userDataDir = await mkdtemp(join(tmpdir(), 'bunny-updater-'))

log(`exe           ${exePath}`)
log(`expect phase  ${expectedPhase}`)

const app = await electron.launch({ executablePath: exePath, args: [`--user-data-dir=${userDataDir}`] })
const page = await app.firstWindow()
const consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))

await page.waitForSelector('.titlebar', { timeout: 60_000 })
await page.waitForSelector('.view', { timeout: 60_000 })
await app.evaluate(({ BrowserWindow }) => {
  const window = BrowserWindow.getAllWindows()[0]
  window?.setSize(1480, 940)
  window?.setIgnoreMouseEvents(true)
})

async function readStatus() {
  return page.evaluate(() => window.bunny.updates.status())
}

async function waitForPhase(predicate, label) {
  const deadline = Date.now() + timeoutMs
  let status = await readStatus()
  while (Date.now() < deadline) {
    if (predicate(status)) return status
    await page.waitForTimeout(500)
    status = await readStatus()
  }
  throw new Error(`Timed out waiting for ${label}; last phase=${status.phase} message=${status.message}`)
}

try {
  const initial = await readStatus()
  log(`version       ${initial.currentVersion}`)
  log(`feed          ${initial.feed}`)

  check('app is running as a packaged build', initial.packaged === true, `packaged=${initial.packaged}`)
  check('update feed points at the release repository', initial.feed === 'CortexIAC/media-hub', initial.feed)
  if (expectVersion) {
    check('installed version matches the expected build', initial.currentVersion === expectVersion, initial.currentVersion)
  }

  // The panel has to exist before the check is worth anything.
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('heading', { name: 'Updates' }).waitFor({ timeout: 20_000 })
  check('Settings shows an Updates panel', true)

  const panelText = await page.locator('.settings-card', { has: page.getByRole('heading', { name: 'Updates' }) }).innerText()
  check('panel names the release feed', panelText.includes('CortexIAC/media-hub'))
  check('panel reports the installed version', panelText.includes(initial.currentVersion))

  await page.getByRole('button', { name: 'Check for updates' }).click()
  const checked = await waitForPhase((status) => status.phase !== 'checking', 'the check to finish')
  log(`phase         ${checked.phase}`)
  if (checked.message) log(`message       ${checked.message}`)
  if (checked.version) log(`offered       ${checked.version}`)

  check('check reached a conclusive phase', ['up-to-date', 'available', 'error'].includes(checked.phase), checked.phase)
  check('status was stamped with a check time', typeof checked.checkedAt === 'number')

  if (expectedPhase === 'up-to-date') {
    check('app reports up to date against the published release', checked.phase === 'up-to-date', `${checked.phase}${checked.message ? `: ${checked.message}` : ''}`)
  } else if (expectedPhase === 'available') {
    check('app found the newer release', checked.phase === 'available', `${checked.phase}${checked.message ? `: ${checked.message}` : ''}`)
    check('offered version is newer than the installed one', Boolean(checked.version) && checked.version !== checked.currentVersion, `${checked.version}`)
  }

  await page.screenshot({ path: join(screenshotDir, `updater-${checked.phase}.png`) })

  if (shouldDownload && checked.phase === 'available') {
    const downloadButton = page.getByRole('button', { name: /^Download / })
    await downloadButton.click()
    const downloading = await waitForPhase(
      (status) => status.phase === 'downloading' || status.phase === 'downloaded' || status.phase === 'error',
      'the download to start'
    )
    log(`download      started (${Math.round(downloading.percent)}%)`)

    const finished = await waitForPhase(
      (status) => status.phase === 'downloaded' || status.phase === 'error',
      'the download to finish'
    )
    check('update downloaded and verified', finished.phase === 'downloaded', `${finished.phase}${finished.message ? `: ${finished.message}` : ''}`)

    const downloadedText = await page
      .locator('.settings-card', { has: page.getByRole('heading', { name: 'Updates' }) })
      .innerText()
    check('panel shows the downloaded version', finished.phase !== 'downloaded' || downloadedText.includes('ready to install'))
    check(
      'install control is offered',
      finished.phase !== 'downloaded' || (await page.getByRole('button', { name: 'Restart and install' }).count()) === 1
    )
    log(`downloaded    ${finished.version}`)
    await page.screenshot({ path: join(screenshotDir, 'updater-downloaded.png') })
    // Deliberately stops here: installing would replace the app under the test.
  }

  check('no renderer errors during the update flow', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
} finally {
  await app.close().catch(() => undefined)
}

for (const entry of checks) {
  console.log(`${entry.ok ? 'PASS' : 'FAIL'}  ${entry.name}${entry.detail && !entry.ok ? ` — ${entry.detail}` : ''}`)
}
console.log(`\n${checks.filter((entry) => entry.ok).length}/${checks.length} checks passed`)
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
