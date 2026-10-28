import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/**
 * Builds, tags and publishes the Windows release that the in-app updater reads.
 *
 *   npm run release:win            # publish the version in package.json
 *   npm run release:win -- --dry-run
 *
 * GitHub will not attach a published release to a tag that does not exist yet
 * (it answers 422 "Published releases must have a valid tag"), so the tag is
 * created and pushed before electron-builder runs. The token comes from
 * GH_TOKEN, or from the credential Git already has for github.com.
 */

const dryRun = process.argv.includes('--dry-run')
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const version = pkg.version
const tag = `v${version}`

function git(args, options = {}) {
  return execFileSync('git', args, { encoding: 'utf8', ...options }).trim()
}

function step(message) {
  console.log(`\n== ${message}`)
}

function tokenFromGitCredentialManager() {
  const input = 'protocol=https\nhost=github.com\n\n'
  const result = spawnSync('git', ['credential', 'fill'], { input, encoding: 'utf8' })
  if (result.status !== 0) return null
  const match = /^password=(.+)$/m.exec(result.stdout ?? '')
  return match?.[1]?.trim() || null
}

step(`Releasing ${version}`)

const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
if (branch !== 'master' && branch !== 'main') {
  console.warn(`warning: releasing from "${branch}", not master`)
}

const dirty = git(['status', '--porcelain'])
if (dirty) {
  console.error('The working tree has uncommitted changes. Commit them first so the tag matches the release.')
  console.error(dirty.split('\n').slice(0, 10).join('\n'))
  process.exit(1)
}

let remoteTags = git(['ls-remote', '--tags', 'origin'])
if (!remoteTags.includes(`refs/tags/${tag}`)) {
  console.log(`tagging ${tag}`)
  if (!dryRun) {
    try {
      git(['tag', tag])
    } catch {
      // Tag already exists locally from an earlier attempt.
    }
  }
} else {
  console.log(`tag ${tag} already on origin`)
}

const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? tokenFromGitCredentialManager()
if (!token) {
  console.error('No GitHub token. Set GH_TOKEN (repo scope) or sign in with Git so a credential is stored.')
  process.exit(1)
}

if (dryRun) {
  console.log('\ndry run: would push master + the tag, build, and publish')
  process.exit(0)
}

step('Pushing the branch and tag')
git(['push', 'origin', branch])
execFileSync('git', ['push', 'origin', tag], { stdio: 'inherit' })

step('Building')
execFileSync('npm', ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' })

step('Publishing to GitHub')
const publish = spawnSync('npx', ['electron-builder', '--win', '--publish', 'always'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, GH_TOKEN: token }
})

if (publish.status !== 0) {
  console.error(
    '\nPublishing failed. GitHub's upload endpoint occasionally drops an asset mid-release; ' +
      're-running this command resumes the same release and uploads what is missing.'
  )
  process.exit(publish.status ?? 1)
}

console.log(`\nPublished ${tag}. Installed copies will offer ${version} the next time they check.`)
