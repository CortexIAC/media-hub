import { createReadStream, promises as fs } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import type { AddressInfo } from 'node:net'

/**
 * Serves the built renderer from a loopback HTTP origin.
 *
 * A file:// document has no usable origin or Referer, which the YouTube
 * embedded player rejects (error 152/153). Loopback HTTP is a secure context in
 * Chromium, keeps the renderer sandboxed exactly as before, and is never
 * reachable from outside this machine.
 */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
}

export interface RendererServer {
  origin: string
  close: () => Promise<void>
}

export async function startRendererServer(rootDir: string): Promise<RendererServer> {
  const root = normalize(rootDir)
  let server: Server

  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      const relative = decodeURIComponent(url.pathname)
      const target = normalize(join(root, relative === '/' ? 'index.html' : relative))

      if (target !== root && !target.startsWith(`${root}${sep}`)) {
        response.writeHead(403).end('Forbidden')
        return
      }

      let filePath = target
      try {
        const stat = await fs.stat(filePath)
        if (stat.isDirectory()) filePath = join(filePath, 'index.html')
      } catch {
        // Unknown paths fall back to the SPA entry point.
        filePath = join(root, 'index.html')
      }

      const extension = extname(filePath).toLowerCase()
      response.writeHead(200, {
        'Content-Type': MIME[extension] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      })
      createReadStream(filePath)
        .on('error', () => response.destroy())
        .pipe(response)
    } catch {
      response.writeHead(500).end('Renderer server error')
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address() as AddressInfo
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
  }
}
