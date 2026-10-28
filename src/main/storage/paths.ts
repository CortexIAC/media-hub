import { join } from 'node:path'

/** Path helpers shared by the library, scanner and protocols. */

export function normalizePathKey(filePath: string): string {
  const unified = filePath.replace(/\\/g, '/')
  return process.platform === 'win32' ? unified.toLowerCase() : unified
}

export function dataPaths(userDataDir: string) {
  const artworkDir = join(userDataDir, 'artwork')
  return {
    root: userDataDir,
    artworkDir,
    library: join(userDataDir, 'library.json'),
    playlists: join(userDataDir, 'playlists.json'),
    settings: join(userDataDir, 'settings.json'),
    session: join(userDataDir, 'session.json'),
    streams: join(userDataDir, 'streams.json'),
    youtube: join(userDataDir, 'youtube.json')
  }
}

export type DataPaths = ReturnType<typeof dataPaths>
