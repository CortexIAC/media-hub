import { promises as fs, createReadStream } from 'node:fs'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { protocol } from 'electron'
import type { Track } from '@core/models'
import { parseRange } from './media/byteRange'
import type { LibraryStore } from './storage/libraryStore'
import { dataPaths } from './storage/paths'

/**
 * bunny-media://track/<trackId>   streams a library track with HTTP range support
 * bunny-media://artwork/<file>    serves a cached cover image
 *
 * The renderer never receives a filesystem path: ids are resolved through the
 * library index, and imports/artwork filenames are validated before use.
 */
export const MEDIA_SCHEME = 'bunny-media'

/**
 * Lets the renderer read samples from local media through Web Audio.
 *
 * Only this app's own scheme serves these responses, and the content is the
 * user's own library, so the permissive origin is not a leak: the scheme is
 * unreachable from any other page.
 */
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges'
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.webm': 'audio/webm',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp'
}

export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        // Web Audio refuses to read samples from cross-origin media: a
        // MediaElementAudioSourceNode fed by an uncorsed resource outputs pure
        // silence. The renderer page and this scheme are different origins, so
        // the equalizer/boost graph would mute every track. CORS mode plus the
        // Access-Control-Allow-Origin header below makes the resource
        // CORS-same-origin, which keeps the graph audible.
        corsEnabled: true,
        stream: true,
        bypassCSP: false
      }
    }
  ])
}

export function isInternalUrl(rawUrl: string): boolean {
  return rawUrl.startsWith(`${MEDIA_SCHEME}://`)
}

export function trackUrl(trackId: string): string {
  return `${MEDIA_SCHEME}://track/${encodeURIComponent(trackId)}`
}

export function artworkUrl(artworkId: string): string {
  return `${MEDIA_SCHEME}://artwork/${encodeURIComponent(artworkId)}`
}

export function registerMediaProtocol(store: LibraryStore, userDataDir: string): void {
  const paths = dataPaths(userDataDir)

  protocol.handle(MEDIA_SCHEME, async (request) => {
    let url: URL
    try {
      url = new URL(request.url)
    } catch {
      return new Response('Bad request', { status: 400 })
    }

    if (url.host === 'track') {
      const trackId = decodeURIComponent(url.pathname.replace(/^\//, ''))
      const track = store.getTrack(trackId)
      if (!track) return new Response('Unknown track', { status: 404 })
      return streamFile(track, request.headers.get('range'))
    }

    if (url.host === 'artwork') {
      const artworkId = decodeURIComponent(url.pathname.replace(/^\//, ''))
      if (!/^[a-f0-9]{8,64}\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(artworkId)) {
        return new Response('Invalid artwork id', { status: 400 })
      }
      const filePath = joinArtwork(paths.artworkDir, artworkId)
      return streamPath(filePath, request.headers.get('range'), artworkId)
    }

    return new Response('Not found', { status: 404 })
  })
}

async function streamFile(track: Track, rangeHeader: string | null): Promise<Response> {
  return streamPath(track.path, rangeHeader, track.id)
}

async function streamPath(filePath: string, rangeHeader: string | null, label: string): Promise<Response> {
  let stat
  try {
    stat = await fs.stat(filePath)
  } catch {
    return new Response('File not found', { status: 404 })
  }
  if (!stat.isFile()) return new Response('Not a file', { status: 404 })

  const size = stat.size
  const contentType = MIME_BY_EXTENSION[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  const parsed = parseRange(rangeHeader, size)
  // A range the file cannot satisfy (Chromium probes just past EOF while
  // seeking) falls back to the full stream instead of a 416 that would surface
  // as a console error. The client can re-request a byte range afterwards.
  const range = parsed === 'invalid' ? null : parsed

  if (size === 0) {
    return new Response(null, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': '0',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        'X-Media-Id': label,
        ...CORS_HEADERS
      }
    })
  }

  const start = range ? range.start : 0
  const end = range ? range.end : size - 1
  const length = end - start + 1
  const nodeStream = createReadStream(filePath, { start, end })
  // Chromium consumes this as a normal streaming response; errors surface as a
  // media error in the renderer instead of crashing the main process.
  nodeStream.on('error', (error) => console.warn(`[protocol] read failed for ${label}: ${error.message}`))

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Length': String(length),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    ...CORS_HEADERS
  }
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`

  return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
    status: range ? 206 : 200,
    headers
  })
}

function joinArtwork(dir: string, name: string): string {
  const separator = dir.includes('\\') ? '\\' : '/'
  return `${dir}${separator}${name}`
}
