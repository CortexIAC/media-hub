import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright-core'

/**
 * Live check for the Streams screen.
 *
 * Serves a real WAV file plus an M3U channel list over loopback, then drives the
 * built app: add the playlist, play a channel, confirm the media element's clock
 * actually advances (not just that a player mounted), confirm playback survives
 * navigating away, and confirm a container Chromium cannot decode is reported
 * with the external-player path. The HLS playlist is fetched through the app's
 * own bunny-stream: proxy to prove its URIs are rewritten.
 *
 * Run with `npm run build && node scripts/check-streams.mjs`.
 */

const projectRoot = process.cwd()
const screenshotDir = join(projectRoot, 'screenshots')
const failures = []
const checks = []

function check(name, condition, detail = '') {
  checks.push({ name, ok: Boolean(condition), detail })
  if (!condition) failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

function toneWav(seconds = 4, sampleRate = 44100) {
  const samples = Math.floor(seconds * sampleRate)
  const dataSize = samples * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  for (let index = 0; index < samples; index += 1) {
    const value = Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 0.28
    buffer.writeInt16LE(Math.round(value * 32767), 44 + index * 2)
  }
  return buffer
}

const wav = toneWav()
let origin = ''

function serve() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const path = url.pathname

    const sendWav = (head) => {
      const range = request.headers.range
      if (range) {
        const match = /bytes=(\d*)-(\d*)/.exec(range)
        const start = Number(match?.[1] || 0)
        const end = match?.[2] ? Number(match[2]) : wav.length - 1
        const slice = wav.subarray(start, Math.min(end, wav.length - 1) + 1)
        head.writeHead(206, {
          'Content-Type': 'audio/wav',
          'Content-Length': slice.length,
          'Content-Range': `bytes ${start}-${start + slice.length - 1}/${wav.length}`,
          'Accept-Ranges': 'bytes'
        })
        head.end(slice)
        return
      }
      head.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Content-Length': wav.length,
        'Accept-Ranges': 'bytes'
      })
      head.end(wav)
    }

    if (path === '/tone.wav' || path === '/second.wav') {
      if (request.method === 'HEAD') {
        response.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length, 'Accept-Ranges': 'bytes' })
        response.end()
        return
      }
      sendWav(response)
      return
    }

    if (path === '/channels.m3u') {
      const body = [
        '#EXTM3U',
        '#EXTINF:-1 group-title="Test radio",Tone Channel One',
        `${origin}/tone.wav`,
        '#EXTINF:-1 group-title="Test radio",Tone Channel Two',
        `${origin}/second.wav`
      ].join('\n')
      response.writeHead(200, { 'Content-Type': 'audio/x-mpegurl', 'Content-Length': Buffer.byteLength(body) })
      response.end(body)
      return
    }

    if (path === '/master.m3u8') {
      const body = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=640x360\nvariant/stream.m3u8\n'
      response.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' })
      response.end(body)
      return
    }

    if (path === '/variant/stream.m3u8') {
      const body = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:4,\nseg0.ts\n#EXT-X-ENDLIST'
      response.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' })
      response.end(body)
      return
    }

    if (path === '/clip.mkv') {
      response.writeHead(200, { 'Content-Type': 'video/x-matroska', 'Content-Length': '12' })
      response.end('fake-matroska')
      return
    }

    response.writeHead(404, { 'Content-Type': 'text/plain' })
    response.end('not found')
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      origin = `http://127.0.0.1:${address.port}`
      resolve(server)
    })
  })
}

async function waitForValue(fn, predicate, timeoutMs = 25_000) {
  const started = Date.now()
  let last
  while (Date.now() - started < timeoutMs) {
    last = await fn()
    if (predicate(last)) return last
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return last
}

const server = await serve()
mkdirSync(screenshotDir, { recursive: true })
const userDataDir = mkdtempSync(join(tmpdir(), 'bunny-streams-'))

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userDataDir}`],
  cwd: projectRoot
})

try {
  const page = await app.firstWindow()
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))

  await page.waitForSelector('.titlebar', { timeout: 60_000 })
  await page.waitForSelector('.view', { timeout: 60_000 })
  await page.bringToFront()
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1480, 940)
  })

  await page.locator('.nav-item', { hasText: 'Streams' }).first().click()
  await page.waitForSelector('.stream-add-input')

  // --- 1. Import an M3U channel list -------------------------------------
  await page.fill('.stream-add-input', `${origin}/channels.m3u`)
  await page.getByRole('button', { name: /add stream/i }).click()

  const rows = await waitForValue(() => page.locator('.stream-row').count(), (count) => count >= 2)
  check('M3U channel list expands into entries', rows >= 2, `rows=${rows}`)

  const names = await page.locator('.stream-row-name').allInnerTexts()
  check('Playlist titles are used as names', names.includes('Tone Channel One'), names.join(' | '))
  const groupLabel = await page.locator('.stream-group-head h3').first().innerText()
  check('group-title groups the imported channels', groupLabel.trim().toLowerCase() === 'test radio', groupLabel)

  // --- 2. Play a channel and prove the clock moves ------------------------
  await page.locator('.stream-row', { hasText: 'Tone Channel One' }).locator('.stream-play').click()
  await page.waitForSelector('.stream-video', { timeout: 15_000 })

  const src = await page.locator('.stream-video').getAttribute('src')
  check('Media is served through the bunny-stream proxy', Boolean(src?.startsWith('bunny-stream://proxy/')), src ?? 'no src')

  const advanced = await waitForValue(
    () => page.evaluate(() => {
      const video = document.querySelector('.stream-video')
      if (!video) return { time: -1, ready: -1 }
      return { time: video.currentTime, ready: video.readyState }
    }),
    (state) => state.time > 0.5 && state.ready >= 2
  )
  check('Audio actually plays (currentTime advances past 0.5s)', advanced?.time > 0.5, `time=${advanced?.time} ready=${advanced?.ready}`)

  await page.waitForTimeout(300)
  await page.screenshot({ path: join(screenshotDir, '18-streams-stage.png'), animations: 'disabled' })

  // --- 3. Playback survives leaving the screen ---------------------------
  await page.locator('.nav-item', { hasText: 'Music' }).first().click()
  await page.waitForSelector('.stream-host.is-dock', { timeout: 10_000 })
  const docked = await waitForValue(
    () => page.evaluate(() => document.querySelector('.stream-host.is-dock .stream-video')?.currentTime ?? -1),
    (time) => time > 0.8
  )
  check('Stream keeps playing after leaving the Streams screen', docked > 0.8, `time=${docked}`)
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(screenshotDir, '19-stream-dock.png'), animations: 'disabled' })

  await page.locator('.stream-host.is-dock').getByRole('button', { name: /stop the stream/i }).click()
  await page.waitForTimeout(200)
  check('Stop removes the dock', (await page.locator('.stream-host').count()) === 0)

  // --- 4. A container Chromium cannot decode is reported, not faked -------
  await page.locator('.nav-item', { hasText: 'Streams' }).first().click()
  await page.fill('.stream-add-input', `${origin}/clip.mkv`)
  await page.getByRole('button', { name: /add stream/i }).click()
  await waitForValue(() => page.locator('.stream-row').count(), (count) => count >= 3)

  const mkvRow = page.locator('.stream-row', { hasText: 'clip' }).first()
  const meta = await mkvRow.locator('.stream-row-meta').innerText()
  check('MKV is flagged as needing an external player', meta.includes('external player'), meta)

  await mkvRow.locator('.stream-play').click()
  await page.waitForSelector('.stream-overlay.is-error', { timeout: 10_000 })
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(screenshotDir, '20-stream-error.png'), animations: 'disabled' })
  const errorText = await page.locator('.stream-overlay.is-error').innerText()
  check('Unsupported stream explains why and offers VLC', /VLC/i.test(errorText), errorText.replace(/\s+/g, ' ').slice(0, 120))

  // --- 5. HLS playlists are proxied and rewritten ------------------------
  const hls = await page.evaluate(async (url) => {
    const response = await fetch(`bunny-stream://proxy/${encodeURIComponent(url)}`)
    return { ok: response.ok, status: response.status, body: await response.text() }
  }, `${origin}/master.m3u8`)

  const proxiedVariants = (hls.body.match(/bunny-stream:\/\/proxy\//g) ?? []).length
  check('HLS master playlist is rewritten through the proxy', hls.ok && proxiedVariants >= 1, `status=${hls.status} links=${proxiedVariants}`)
  const proxiedVariant = (hls.body.match(/bunny-stream:\/\/proxy\/([^\s]+)/)?.[1] ?? '')
  const media = await page.evaluate(async (encoded) => {
    const response = await fetch(`bunny-stream://proxy/${encoded}`)
    return { ok: response.ok, body: await response.text() }
  }, proxiedVariant)
  check('HLS media playlist can be fetched through the proxy', media.ok && media.body.includes('#EXT-X-TARGETDURATION'), media.body.slice(0, 60))
  check('HLS segments and keys are proxied too', /URI="bunny-stream:\/\/proxy\//.test(media.body) && media.body.includes('bunny-stream://proxy/') , media.body.replace(/\n/g, ' ').slice(0, 160))

  // --- 6. Real HLS playback against a public test stream ------------------
  // hls.js has to segment-demux for real before "HLS works" is a claim worth
  // making. If the network is unavailable this is reported as skipped rather
  // than silently passed.
  const publicHls = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
  let hlsReachable = false
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    const response = await fetch(publicHls, { signal: controller.signal })
    clearTimeout(timer)
    hlsReachable = response.ok
  } catch {
    hlsReachable = false
  }

  if (!hlsReachable) {
    console.log('SKIP  real HLS playback — the public test stream was unreachable from this network')
  } else {
    await page.locator('.nav-item', { hasText: 'Streams' }).first().click()
    await page.fill('.stream-add-input', publicHls)
    await page.getByRole('button', { name: /add stream/i }).click()
    const hlsRow = page.locator('.stream-row', { hasText: 'x36xhzz' }).first()
    await hlsRow.waitFor({ timeout: 20_000 })
    await hlsRow.locator('.stream-play').click()

    const hlsPlayed = await waitForValue(
      () => page.evaluate(() => {
        const video = document.querySelector('.stream-video')
        if (!video) return { time: -1, ready: -1, error: 'no element' }
        return { time: video.currentTime, ready: video.readyState, error: '' }
      }),
      (state) => state.time > 0.6 && state.ready >= 2,
      35_000
    )
    const overlay = await page.locator('.stream-overlay.is-error').count()
    const overlayText = overlay > 0 ? await page.locator('.stream-overlay.is-error').innerText() : ''
    check(
      'Real HLS stream plays through hls.js',
      hlsPlayed?.time > 0.6,
      `time=${hlsPlayed?.time} ready=${hlsPlayed?.ready}${overlayText ? ` overlay=${overlayText.replace(/\s+/g, ' ').slice(0, 120)}` : ''}`
    )
  }

  const relevantErrors = consoleErrors.filter((text) => !/devtools|Autofill/i.test(text))
  check('No unexpected renderer errors', relevantErrors.length === 0, relevantErrors.slice(0, 3).join(' | '))
} catch (error) {
  failures.push(`Harness error: ${error instanceof Error ? error.message : String(error)}`)
} finally {
  await app.close().catch(() => undefined)
  server.close()
}

for (const entry of checks) {
  console.log(`${entry.ok ? 'PASS' : 'FAIL'}  ${entry.name}${entry.ok || !entry.detail ? '' : `  (${entry.detail})`}`)
}

if (failures.length > 0) {
  console.error(`\n${failures.length} stream check(s) failed`)
  process.exitCode = 1
} else {
  console.log('\nAll stream checks passed')
}
