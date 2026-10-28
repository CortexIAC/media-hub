import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright-core'

const projectRoot = process.cwd()
const userDataDir = await mkdtemp(join(tmpdir(), 'bunny-discovery-'))
const env = {}
for (const [key, value] of Object.entries(process.env)) if (value !== undefined) env[key] = value

const app = await electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], cwd: projectRoot, env })
const page = await app.firstWindow()
await page.waitForSelector('.view', { timeout: 60_000 })

for (const query of ['haddix', 'sherlock holmes', 'moonlight sonata']) {
  const response = await page.evaluate((value) => window.bunny.discovery.search(value), query)
  console.log(`\n=== ${query} ===`)
  console.log('searched:', response.searched.join(', '), '| results:', response.results.length)
  for (const error of response.errors) console.log('  error:', error.source, error.message)
  for (const result of response.results.slice(0, 5)) {
    console.log(`  [${result.source}/${result.kind}] ${result.title} — ${result.creator ?? '?'} (${result.accessLabel})`)
  }
}

await app.close()
