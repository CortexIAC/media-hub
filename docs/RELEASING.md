# Packaging and updates

Bunny Media Hub builds a per-user Windows installer, publishes it to
[CortexIAC/media-hub](https://github.com/CortexIAC/media-hub), and installed
copies read that feed from **Settings → Updates**.

## Build an installer

```bash
npm install
npm run dist          # typecheck, vite build, NSIS installer into release/
npm run dist:dir      # unpacked app only (release/win-unpacked), no installer
npm run icon          # regenerate build/icon.ico + icon.png from source
```

`npm run dist` writes `release/BunnyMediaHub-Setup-<version>.exe` (about 118 MB)
plus `.exe.blockmap` and `latest.yml`. `release/` is git-ignored: installers are
distributed through GitHub releases, never committed.

The installer is **NSIS, one-click, per-user**: it installs under
`%LOCALAPPDATA%\Programs`, needs no administrator prompt, and creates Desktop
and Start-menu shortcuts. That layout is also the only one where self-updating
works cleanly — a per-machine install would need elevation for every update.

The build is **not code-signed** (there is no certificate in this project), so
Windows SmartScreen shows an "unknown publisher" warning on first run. Update
packages are still checked against the SHA-512 in `latest.yml` before they are
applied, so integrity is verified even without a signature.

## Publish a release

```bash
npm version 0.1.2 --no-git-tag-version   # pick the next version
git add package.json package-lock.json
git commit -m "Release 0.1.2"
npm run release:win
```

`release:win` refuses to run on a dirty tree, creates and pushes the `v<version>`
tag, pushes the branch, builds, and uploads the three feed files to a published
GitHub release. Re-running it resumes the same release and uploads whatever is
missing, which is the documented way to recover from a dropped upload.

Two things it handles that the raw command does not:

- **The tag must exist first.** GitHub rejects a *published* release whose tag is
  absent with `422 Published releases must have a valid tag`. electron-builder
  creates tags only as a side effect and can leave the release unpublished; the
  script always pushes the tag first.
- **The token.** electron-builder needs `GH_TOKEN` with `repo` scope. The script
  uses `GH_TOKEN`/`GITHUB_TOKEN` if set, otherwise the credential Git Credential
  Manager already stores for `github.com` — no token is written into the project
  or its logs.

Draft releases are invisible to the updater by design (`releaseType: release` in
[electron-builder.yml](../electron-builder.yml)).

## How the updater works

```
release assets            installed app
-------------             -------------
latest.yml        ──────► app-update.yml (owner/repo baked in at build time)
BunnyMediaHub-…exe         └─ Settings → Updates
…exe.blockmap                    │  check    → "0.1.2 available"
                                 │  download → bytes, %, MB/s, SHA-512 verified
                                 └─ restart  → silent NSIS install, relaunch
```

- The check runs once, quietly, about 12 seconds after launch, and otherwise only
  when you press the button. **Nothing is downloaded until you press Download.**
- A downloaded update is installed silently on "Restart and install", or on the
  next normal quit (`autoInstallOnAppQuit`).
- Updates never run from source: `npm run dev` and `npm start` report
  `packaged: false` and disable the button, so a dev session cannot replace
  itself.
- Before the installer runs, every JSON store is flushed to disk — library,
  playlists, settings, session, YouTube, streams and the Archive library all
  survive an update.
- Failures are reported in the panel, not as a crash: an offline machine, a
  release that does not exist yet, and an integrity failure each get their own
  message.

The only external requirement is that the repository stays public; the updater
reads releases anonymously, so no key ships with the app.

## Test an update

Three ways, in increasing order of realism:

```bash
# 1. Drive the packaged app against the live feed (no install needed)
npm run dist
npm run check:updater                                    # expects "up to date"
EXPECT=available DOWNLOAD=1 npm run check:updater         # when a newer release exists

# 2. Use an older published release
#    Install the installer from any earlier release (for example v0.1.0),
#    open Settings → Updates, press Check, then Download, then Restart and install.

# 3. Publish a new version and let an installed copy find it
npm version 0.1.2 --no-git-tag-version && git commit -am "Release 0.1.2" && npm run release:win
```

`scripts/check-updater.mjs` launches `release/win-unpacked` with Playwright,
clicks through the real Settings panel and asserts the status the main process
reports over IPC. Point it at any build with `EXE=…`, pin the expected version
with `EXPECT_VERSION=…`, and it exits non-zero when an expectation is missed, so
a broken feed is never mistaken for a pass.

## Verified on 28 October 2026

Windows 11 (10.0.26200), Node 24.21.0, Electron 45.1.0, electron-builder 26.18.0,
electron-updater 6.8.11.

| Check | Result |
| --- | --- |
| `npm run dist` produces a working installer | pass — 118 MB, icon + version resource embedded |
| `app-update.yml` points at `CortexIAC/media-hub` | pass |
| Packaged app starts from `release/win-unpacked` | pass |
| Settings → Updates shows the installed version and the feed | pass |
| Check against a repository with no release | pass — "No published release was found…" instead of a crash |
| Check against the published 0.1.0 release | pass — "up to date" (9/9 checks; 10/10 on the 0.1.1 build) |
| 0.1.0 build finds the published 0.1.1 release | pass — offers 0.1.1 |
| 0.1.0 downloads 0.1.1 and verifies it | pass — progress reached 100%, panel offered "Restart and install" (14/14 checks) |
| Downloaded installer cached for install | pass — `%LOCALAPPDATA%\bunny-media-hub-updater\pending\BunnyMediaHub-Setup-0.1.1.exe` |
| Existing suites after packaging changes | pass — 192 unit tests, 9 e2e tests, typecheck clean |
| Release notes render as readable text | pass — unit-tested (electron-builder's HTML-ish commit body is flattened in main before it reaches the panel) |

Not verified, and therefore not claimed:

- **The silent install itself was not executed by the automated check** — it
  would replace the app under the test process. The "Restart and install" button,
  the flush-before-install path and the downloaded artifact were verified; the
  final NSIS hand-over is a manual step (open an older build, update, confirm the
  window reopens on the new version).
- **No certificate**: SmartScreen behaviour on a fresh machine was not observed.
- **macOS and Linux packaging is not configured.** Electron's macOS updater also
  requires a signed app, so it needs a certificate first.
- **Differential (blockmap) updates were not measured.** The `.blockmap` is
  published; the check downloaded the full package.
