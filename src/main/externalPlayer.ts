import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { shell } from 'electron'
import { normalizeStreamUrl } from '@core/streams'

/**
 * Hand-off for streams Chromium cannot decode (MKV, HEVC, AC3, transport
 * streams). VLC is used when it is installed; otherwise the URL goes to the
 * system handler so the user is never left with a dead "unsupported" message.
 */

const WINDOWS_CANDIDATES = [
  ['ProgramFiles', 'VideoLAN', 'VLC', 'vlc.exe'],
  ['ProgramFiles(x86)', 'VideoLAN', 'VLC', 'vlc.exe'],
  ['ProgramW6432', 'VideoLAN', 'VLC', 'vlc.exe']
] as const

const UNIX_CANDIDATES = ['/Applications/VLC.app/Contents/MacOS/VLC', '/usr/bin/vlc', '/usr/local/bin/vlc', '/snap/bin/vlc']

export function findVlc(): string | null {
  const configured = process.env.VLC_PATH
  if (configured && existsSync(configured)) return configured

  if (process.platform === 'win32') {
    for (const [variable, ...parts] of WINDOWS_CANDIDATES) {
      const root = process.env[variable]
      if (!root) continue
      const candidate = join(root, ...parts)
      if (existsSync(candidate)) return candidate
    }
    return null
  }

  for (const candidate of UNIX_CANDIDATES) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

export interface ExternalPlayerResult {
  ok: boolean
  player: 'vlc' | 'system' | null
  error: string | null
}

export async function openStreamExternally(rawUrl: string): Promise<ExternalPlayerResult> {
  const url = normalizeStreamUrl(rawUrl)
  if (!url) return { ok: false, player: null, error: 'Only http(s) stream links can be opened externally.' }

  const vlc = findVlc()
  if (vlc) {
    try {
      const child = spawn(vlc, [url], { detached: true, stdio: 'ignore' })
      child.on('error', (error) => console.warn(`[vlc] ${error.message}`))
      child.unref()
      return { ok: true, player: 'vlc', error: null }
    } catch (error) {
      console.warn(`[vlc] could not launch ${vlc}: ${describe(error)}`)
    }
  }

  try {
    await shell.openExternal(url)
    return { ok: true, player: 'system', error: null }
  } catch (error) {
    return { ok: false, player: null, error: `Could not open that link: ${describe(error)}` }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
