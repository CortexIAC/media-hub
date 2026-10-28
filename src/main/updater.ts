import { app, ipcMain, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC, type UpdateNotes, type UpdateStatus } from '@shared/ipc'
import { releaseNotesToText, type ReleaseNotesInput } from '@core/releaseNotes'

/**
 * Windows update handling.
 *
 * electron-builder writes `resources/app-update.yml` from the `publish` block in
 * electron-builder.yml, and electron-updater reads `latest.yml` from the newest
 * GitHub release described there. Downloads are explicit (never background
 * fetching of a build the user did not ask for), and installing only happens
 * from the "Restart and install" button.
 */

const FEED = 'CortexIAC/media-hub'
export const RELEASES_URL = `https://github.com/${FEED}/releases`

export interface UpdaterOptions {
  getWindow: () => BrowserWindow | null
  /** Flush stores and stop accepting work; the process is about to be replaced. */
  prepareToInstall: () => Promise<void>
}

function notesToText(notes: UpdateNotes): string | null {
  return releaseNotesToText(notes as ReleaseNotesInput)
}

export class UpdateService {
  private status: UpdateStatus
  private checkInFlight = false
  private installStarted = false

  constructor(private readonly options: UpdaterOptions) {
    const packaged = app.isPackaged

    this.status = {
      phase: packaged ? 'idle' : 'disabled',
      currentVersion: app.getVersion(),
      version: null,
      releaseName: null,
      releaseNotes: null,
      releaseDate: null,
      percent: 0,
      bytesPerSecond: 0,
      transferred: 0,
      total: 0,
      message: packaged
        ? null
        : 'Updates only run in an installed build. Run from source the app reports its version but does not contact GitHub.',
      checkedAt: null,
      feed: FEED,
      packaged
    }

    if (!packaged) return

    autoUpdater.autoDownload = false
    // If a download finished and the user quits instead of pressing the button,
    // let electron-updater install it on exit rather than throwing it away.
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = false

    autoUpdater.on('checking-for-update', () => {
      this.patch({ phase: 'checking', message: null })
    })

    autoUpdater.on('update-available', (info) => {
      this.patch({
        phase: 'available',
        version: info.version,
        releaseName: info.releaseName ?? null,
        releaseNotes: notesToText(info.releaseNotes as UpdateNotes),
        releaseDate: info.releaseDate ?? null,
        percent: 0,
        transferred: 0,
        total: 0,
        message: null,
        checkedAt: Date.now()
      })
    })

    autoUpdater.on('update-not-available', (info) => {
      this.patch({
        phase: 'up-to-date',
        version: info.version ?? null,
        releaseName: null,
        releaseNotes: null,
        releaseDate: null,
        message: null,
        checkedAt: Date.now()
      })
    })

    autoUpdater.on('download-progress', (progress) => {
      this.patch({
        phase: 'downloading',
        percent: Math.max(0, Math.min(100, progress.percent)),
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      this.patch({
        phase: 'downloaded',
        version: info.version,
        releaseName: info.releaseName ?? null,
        releaseNotes: notesToText(info.releaseNotes as UpdateNotes),
        percent: 100,
        message: null,
        checkedAt: this.status.checkedAt ?? Date.now()
      })
    })

    autoUpdater.on('error', (error) => {
      this.patch({
        // A failed background check must not look like a failed download.
        phase: 'error',
        message: describeUpdateError(error),
        checkedAt: this.status.checkedAt ?? Date.now()
      })
    })
  }

  snapshot(): UpdateStatus {
    return { ...this.status }
  }

  /** Check after launch without blocking startup; failures stay silent. */
  scheduleStartupCheck(delayMs = 12000): void {
    if (!this.status.packaged) return
    const timer = setTimeout(() => {
      void this.check()
    }, delayMs)
    timer.unref?.()
  }

  async check(): Promise<UpdateStatus> {
    if (!this.status.packaged) return this.snapshot()
    if (this.checkInFlight) return this.snapshot()
    if (this.status.phase === 'downloading' || this.status.phase === 'downloaded') return this.snapshot()

    this.checkInFlight = true
    this.patch({ phase: 'checking', message: null })
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      // The `error` event already recorded a readable message; make sure a
      // missing feed or an offline machine still leaves a status behind.
      if (this.status.phase === 'checking') {
        this.patch({ phase: 'error', message: describeUpdateError(error), checkedAt: Date.now() })
      }
    } finally {
      this.checkInFlight = false
    }
    return this.snapshot()
  }

  async download(): Promise<UpdateStatus> {
    if (!this.status.packaged) return this.snapshot()
    if (this.status.phase === 'downloading' || this.status.phase === 'downloaded') return this.snapshot()

    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      // A failure part-way through a download, or a download that finished but
      // then errored on verification, is reported without discarding progress.
      if (this.snapshot().phase !== 'downloaded') {
        this.patch({ phase: 'error', message: describeUpdateError(error) })
      }
    }
    return this.snapshot()
  }

  async install(): Promise<void> {
    if (this.installStarted) return
    if (this.status.phase !== 'downloaded') return
    this.installStarted = true
    this.patch({ message: 'Restarting to install…' })
    try {
      await this.options.prepareToInstall()
      // Silent NSIS install, then relaunch the new version.
      autoUpdater.quitAndInstall(true, true)
    } catch (error) {
      this.installStarted = false
      this.patch({ phase: 'error', message: `Could not start the installer: ${describeUpdateError(error)}` })
    }
  }

  private patch(partial: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...partial, currentVersion: app.getVersion() }
    this.broadcast()
  }

  private broadcast(): void {
    const window = this.options.getWindow()
    if (!window || window.isDestroyed()) return
    window.webContents.send(IPC.updateChanged, this.snapshot())
  }
}

export function registerUpdaterIpc(service: UpdateService): void {
  ipcMain.handle(IPC.updateStatus, () => service.snapshot())
  ipcMain.handle(IPC.updateCheck, () => service.check())
  ipcMain.handle(IPC.updateDownload, () => service.download())
  ipcMain.handle(IPC.updateInstall, () => service.install())
}

function describeUpdateError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  if (/net::|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONN|socket hang up/i.test(raw)) {
    return 'Could not reach GitHub. Check the connection and try again.'
  }
  if (/404|Cannot find (latest|channel)|no published versions/i.test(raw)) {
    return `No published release was found for ${FEED}. Publish one from the repository, then check again.`
  }
  if (/code signature|signature check/i.test(raw)) {
    return 'The downloaded update failed its integrity check and was discarded.'
  }
  return (raw.split('\n')[0] ?? raw).slice(0, 400)
}
