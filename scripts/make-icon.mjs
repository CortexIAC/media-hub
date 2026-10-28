/**
 * Generates build/icon.png (512) and build/icon.ico (multi-size) for the
 * Windows installer and the taskbar.
 *
 * The mark is drawn from geometry with 4x supersampling rather than shipped as
 * a binary asset, so it stays reproducible from source and matches the app's
 * theme tokens (dark panel + #3ddc84 accent).
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'build')

const BG = [10, 13, 12]
const BG_TOP = [18, 24, 21]
const ACCENT = [61, 220, 132]
const EDGE = [255, 255, 255, 0.14]

// Geometry in unit space (0..1) so every size rasterises identically.
const RADIUS = 0.22
const TRI = { left: 0.375, right: 0.665, top: 0.265, bottom: 0.735, radius: 0.055 }

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false
  const cx = Math.min(Math.max(x, left + radius), right - radius)
  const cy = Math.min(Math.max(y, top + radius), bottom - radius)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= radius * radius
}

/** Rounded right-pointing triangle, area-tested in unit space. */
function insideTriangle(x, y) {
  const { left, right, top, bottom, radius } = TRI
  if (y < top || y > bottom) return false
  const mid = (top + bottom) / 2
  // Half-width of the triangle at this height, measured from `left`.
  const halfHeight = (bottom - top) / 2
  const width = right - left
  const spread = width * (1 - Math.abs(y - mid) / halfHeight)
  if (x > left + spread || x < left) return false
  // Round the corners by shrinking the test near each vertex.
  const dx = x - left
  const dy = Math.abs(y - mid)
  if (dx < radius && dy > halfHeight - radius) {
    const ox = radius - dx
    const oy = dy - (halfHeight - radius)
    if (ox * ox + oy * oy > radius * radius) return false
  }
  return true
}

function blend(dst, src, alpha) {
  return [
    Math.round(dst[0] + (src[0] - dst[0]) * alpha),
    Math.round(dst[1] + (src[1] - dst[1]) * alpha),
    Math.round(dst[2] + (src[2] - dst[2]) * alpha)
  ]
}

function render(size) {
  const SS = 4
  const out = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size
          const y = (py + (sy + 0.5) / SS) / size
          if (!insideRoundedRect(x, y, 0, 0, 1, 1, RADIUS)) continue
          const t = Math.min(1, Math.max(0, (y - 0.05) / 0.9))
          let colour = blend(BG_TOP, BG, t)
          // Inset hairline, fading in from the edge.
          const edgeDepth = Math.min(x, y, 1 - x, 1 - y)
          if (edgeDepth < 0.012) colour = blend(colour, EDGE, (1 - edgeDepth / 0.012) * EDGE[3])
          // Soft accent glow behind the mark.
          const gx = x - 0.53
          const gy = y - 0.5
          const glow = Math.max(0, 1 - Math.sqrt(gx * gx + gy * gy) / 0.42)
          if (glow > 0) colour = blend(colour, ACCENT, glow * glow * 0.11)
          if (insideTriangle(x, y)) colour = ACCENT
          r += colour[0]
          g += colour[1]
          b += colour[2]
          a += 255
        }
      }
      const samples = SS * SS
      const offset = (py * size + px) * 4
      const alpha = a / samples
      out[offset] = alpha === 0 ? 0 : Math.round(r / (a / 255))
      out[offset + 1] = alpha === 0 ? 0 : Math.round(g / (a / 255))
      out[offset + 2] = alpha === 0 ? 0 : Math.round(b / (a / 255))
      out[offset + 3] = Math.round(alpha)
    }
  }
  return out
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function toPng(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** ICO container holding PNG images (supported from Windows Vista on). */
function toIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + images.length * 16
  const entries = []
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16)
    entry[0] = size >= 256 ? 0 : size
    entry[1] = size >= 256 ? 0 : size
    entry[2] = 0
    entry[3] = 0
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    entries.push(entry)
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)])
}

mkdirSync(outDir, { recursive: true })

const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const images = icoSizes.map((size) => ({ size, png: toPng(size, render(size)) }))
writeFileSync(join(outDir, 'icon.ico'), toIco(images))
writeFileSync(join(outDir, 'icon.png'), toPng(512, render(512)))
console.log(`icon.ico (${icoSizes.join(', ')}) and icon.png (512) written to build/`)
