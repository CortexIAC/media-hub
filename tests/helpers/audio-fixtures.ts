import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { Mp3Encoder } from '@breezystack/lamejs'

/**
 * Generates real, playable audio files for tests. No binary fixtures are
 * committed: WAV is built as RIFF/PCM, MP3 is encoded with lamejs, FLAC is
 * encoded with libflac, and the cover image is a real PNG built chunk by chunk.
 */

export interface WavTags {
  title?: string
  artist?: string
  album?: string
  year?: string
  track?: string
  genre?: string
}

export interface WavOptions {
  durationSeconds?: number
  sampleRate?: number
  frequency?: number
  amplitude?: number
  tags?: WavTags
}

export function makeWav(options: WavOptions = {}): Buffer {
  const duration = options.durationSeconds ?? 1
  const sampleRate = options.sampleRate ?? 44_100
  const frequency = options.frequency ?? 440
  const amplitude = options.amplitude ?? 0.22
  const frames = Math.max(1, Math.round(duration * sampleRate))

  const pcm = Buffer.alloc(frames * 2)
  for (let i = 0; i < frames; i += 1) {
    const value = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * amplitude
    pcm.writeInt16LE(Math.round(value * 32767), i * 2)
  }

  const fmt = Buffer.alloc(16)
  fmt.writeUInt16LE(1, 0)
  fmt.writeUInt16LE(1, 2)
  fmt.writeUInt32LE(sampleRate, 4)
  fmt.writeUInt32LE(sampleRate * 2, 8)
  fmt.writeUInt16LE(2, 12)
  fmt.writeUInt16LE(16, 14)

  const chunks: Buffer[] = [riffChunk('fmt ', fmt)]
  if (options.tags && Object.keys(options.tags).length > 0) {
    chunks.push(riffChunk('LIST', infoList(options.tags)))
  }
  chunks.push(riffChunk('data', pcm))

  const body = Buffer.concat([Buffer.from('WAVE', 'ascii'), ...chunks])
  const header = Buffer.alloc(8)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}

const INFO_IDS: Record<keyof WavTags, string> = {
  title: 'INAM',
  artist: 'IART',
  album: 'IPRD',
  year: 'ICRD',
  track: 'ITRK',
  genre: 'IGNR'
}

function infoList(tags: WavTags): Buffer {
  const entries: Buffer[] = [Buffer.from('INFO', 'ascii')]
  for (const [key, value] of Object.entries(tags)) {
    if (!value) continue
    const id = INFO_IDS[key as keyof WavTags]
    if (!id) continue
    entries.push(riffChunk(id, Buffer.concat([Buffer.from(value, 'latin1'), Buffer.from([0])])))
  }
  return Buffer.concat(entries)
}

function riffChunk(id: string, payload: Buffer): Buffer {
  const pad = payload.length % 2 === 1 ? Buffer.from([0]) : Buffer.alloc(0)
  const header = Buffer.alloc(8)
  header.write(id, 0, 'ascii')
  header.writeUInt32LE(payload.length, 4)
  return Buffer.concat([header, payload, pad])
}

export interface Mp3Options {
  durationSeconds?: number
  sampleRate?: number
  frequency?: number
  bitrateKbps?: number
  tags?: WavTags
  coverPng?: Buffer
  lyrics?: string
}

export function makeMp3(options: Mp3Options = {}): Buffer {
  const duration = options.durationSeconds ?? 2
  const sampleRate = options.sampleRate ?? 44_100
  const frequency = options.frequency ?? 330
  const bitrate = options.bitrateKbps ?? 128
  const frames = Math.max(1, Math.round(duration * sampleRate))

  const samples = new Int16Array(frames)
  for (let i = 0; i < frames; i += 1) {
    samples[i] = Math.round(Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.22 * 32767)
  }

  const encoder = new Mp3Encoder(1, sampleRate, bitrate)
  const parts: Buffer[] = []
  const blockSize = 1152
  for (let offset = 0; offset < samples.length; offset += blockSize) {
    const block = samples.subarray(offset, offset + blockSize)
    const encoded = encoder.encodeBuffer(block)
    if (encoded.length > 0) parts.push(Buffer.from(encoded))
  }
  const tail = encoder.flush()
  if (tail.length > 0) parts.push(Buffer.from(tail))

  return Buffer.concat([buildId3(options.tags, options.coverPng, options.lyrics), ...parts])
}

export interface FlacOptions {
  durationSeconds?: number
  sampleRate?: number
  frequency?: number
  tags?: WavTags
}

export async function makeFlac(options: FlacOptions = {}): Promise<Buffer> {
  const duration = options.durationSeconds ?? 2
  const sampleRate = options.sampleRate ?? 44_100
  const frequency = options.frequency ?? 392
  const flac = await loadFlac()
  const frames = Math.max(1, Math.round(duration * sampleRate))

  // The sample count must be known up front: a stream encoder writes STREAMINFO
  // before encoding starts and never rewrites it, so leaving it at 0 would make
  // the file report an unknown duration.
  const encoder = flac.create_libflac_encoder(sampleRate, 1, 16, 5, frames, true, 0)
  if (encoder === 0) throw new Error('libflac: could not create encoder')

  const parts: Buffer[] = []
  const status = flac.init_encoder_stream(encoder, (data: Uint8Array) => {
    parts.push(Buffer.from(data))
  })
  if (status !== 0) throw new Error(`libflac: init failed (${status})`)

  const pcm = new Int32Array(frames)
  for (let i = 0; i < frames; i += 1) {
    const value = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.22
    pcm[i] = Math.round(value * 0x7fff)
  }

  // Feed the encoder in bounded blocks: libflac rejects very large single
  // buffers, which is what longer fixtures would otherwise produce.
  const blockSize = 4096
  for (let offset = 0; offset < frames; offset += blockSize) {
    // A fresh array is required: libflac ignores the byte offset of a view.
    const block = pcm.slice(offset, Math.min(offset + blockSize, frames))
    if (!flac.FLAC__stream_encoder_process_interleaved(encoder, block, block.length)) {
      throw new Error(`libflac: encoding failed at frame ${offset}`)
    }
  }
  if (!flac.FLAC__stream_encoder_finish(encoder)) {
    throw new Error('libflac: finish failed')
  }
  flac.FLAC__stream_encoder_delete(encoder)

  const native = Buffer.concat(parts)
  return options.tags && Object.keys(options.tags).length > 0
    ? insertVorbisComments(native, options.tags)
    : native
}

interface FlacModule {
  create_libflac_encoder: (
    sampleRate: number,
    channels: number,
    bps: number,
    compression: number,
    totalSamples: number,
    verify: boolean,
    blockSize: number
  ) => number
  init_encoder_stream: (encoder: number, write: (data: Uint8Array) => void) => number
  /** These return 1 on success and 0 on failure. */
  FLAC__stream_encoder_process_interleaved: (
    encoder: number,
    samples: Int32Array,
    count: number
  ) => number
  FLAC__stream_encoder_finish: (encoder: number) => number
  FLAC__stream_encoder_delete: (encoder: number) => void
  on: (event: string, handler: () => void) => void
}

let flacPromise: Promise<FlacModule> | undefined

function loadFlac(): Promise<FlacModule> {
  flacPromise ??= new Promise<FlacModule>((resolve, reject) => {
    const require = createRequire(import.meta.url)
    const factory = require('libflacjs') as (variant?: string) => FlacModule
    // The asm.js build is used because the WASM build fetches its binary,
    // which does not resolve under a Node/vitest runner.
    const module = factory()
    module.on('ready', () => resolve(module))
    setTimeout(() => reject(new Error('libflac: timed out loading encoder')), 30_000).unref?.()
  })
  return flacPromise
}

/** Inserts a VORBIS_COMMENT metadata block into a native FLAC stream. */
function insertVorbisComments(native: Buffer, tags: WavTags): Buffer {
  const vendor = Buffer.from('Bunny Media Hub fixtures', 'utf8')
  const comments: Buffer[] = []
  const push = (key: string, value: string | undefined): void => {
    if (!value) return
    const text = Buffer.from(`${key}=${value}`, 'utf8')
    const length = Buffer.alloc(4)
    length.writeUInt32LE(text.length, 0)
    comments.push(length, text)
  }
  push('TITLE', tags.title)
  push('ARTIST', tags.artist)
  push('ALBUM', tags.album)
  push('DATE', tags.year)
  push('TRACKNUMBER', tags.track)
  push('GENRE', tags.genre)

  const vendorLength = Buffer.alloc(4)
  vendorLength.writeUInt32LE(vendor.length, 0)
  const count = Buffer.alloc(4)
  count.writeUInt32LE(comments.length / 2, 0)
  const payload = Buffer.concat([vendorLength, vendor, count, ...comments])

  // Walk the metadata blocks to find where STREAMINFO ends.
  let offset = 4
  const blockHeader = native.subarray(offset, offset + 4)
  const streamInfoLength = blockHeader.readUIntBE(1, 3)
  offset += 4 + streamInfoLength

  const streamInfo = Buffer.from(native.subarray(4, offset))
  streamInfo.writeUInt8(streamInfo.readUInt8(0) & 0x7f, 0) // clear last-block flag

  const commentHeader = Buffer.alloc(4)
  commentHeader[0] = 0x84 // last block, type 4 (VORBIS_COMMENT)
  commentHeader.writeUIntBE(payload.length, 1, 3)

  return Buffer.concat([
    native.subarray(0, 4),
    streamInfo,
    commentHeader,
    payload,
    native.subarray(offset)
  ])
}

function buildId3(tags: WavTags | undefined, coverPng: Buffer | undefined, lyrics: string | undefined): Buffer {
  const frames: Buffer[] = []
  if (tags?.title) frames.push(id3TextFrame('TIT2', tags.title))
  if (tags?.artist) frames.push(id3TextFrame('TPE1', tags.artist))
  if (tags?.album) frames.push(id3TextFrame('TALB', tags.album))
  if (tags?.track) frames.push(id3TextFrame('TRCK', tags.track))
  if (tags?.year) frames.push(id3TextFrame('TYER', tags.year))
  if (tags?.genre) frames.push(id3TextFrame('TCON', tags.genre))
  if (lyrics) {
    // USLT: encoding, language, content descriptor, then the text.
    frames.push(
      id3Frame(
        'USLT',
        Buffer.concat([
          Buffer.from([0]),
          Buffer.from('eng', 'latin1'),
          Buffer.from('\0', 'latin1'),
          Buffer.from(lyrics, 'latin1')
        ])
      )
    )
  }
  if (coverPng) {
    frames.push(
      id3Frame(
        'APIC',
        Buffer.concat([
          Buffer.from([0]),
          Buffer.from('image/png\0', 'latin1'),
          Buffer.from([3]),
          Buffer.from('Front cover\0', 'latin1'),
          coverPng
        ])
      )
    )
  }

  const body = Buffer.concat(frames)
  const size = body.length
  const header = Buffer.from([
    0x49,
    0x44,
    0x33, // "ID3"
    3,
    0,
    0,
    (size >> 21) & 0x7f,
    (size >> 14) & 0x7f,
    (size >> 7) & 0x7f,
    size & 0x7f
  ])
  return Buffer.concat([header, body])
}

function id3TextFrame(id: string, value: string): Buffer {
  return id3Frame(id, Buffer.concat([Buffer.from([0]), Buffer.from(value, 'latin1')]))
}

function id3Frame(id: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(10)
  header.write(id, 0, 'ascii')
  header.writeUInt32BE(payload.length, 4)
  return Buffer.concat([header, payload])
}

/** Minimal valid PNG (RGB, 8-bit) built with correct CRCs. */
export function makePng(width = 64, height = 64, hueShift = 0): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const raw = Buffer.alloc((width * 3 + 1) * height)
  let cursor = 0
  for (let y = 0; y < height; y += 1) {
    raw[cursor] = 0
    cursor += 1
    for (let x = 0; x < width; x += 1) {
      raw[cursor] = (x * 4 + hueShift) % 256
      raw[cursor + 1] = 160
      raw[cursor + 2] = (y * 4 + hueShift) % 256
      cursor += 3
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export interface FixtureLibrary {
  root: string
  albumOne: string
  albumTwo: string
  albumThree: string
  broken: string
  taggedWav: string
  untaggedWav: string
  taggedMp3: string
  secondMp3: string
  losslessFlac: string
  coverPng: Buffer
}

export async function createFixtureLibrary(existingRoot?: string): Promise<FixtureLibrary> {
  const root = existingRoot ?? (await mkdtemp(join(tmpdir(), 'bunny-fixtures-')))
  const albumOne = join(root, 'Signal Garden')
  const albumTwo = join(root, 'Artwork Sessions')
  const albumThree = join(root, 'Night Drive')
  const broken = join(root, 'Broken Files')
  await Promise.all([
    mkdir(albumOne, { recursive: true }),
    mkdir(albumTwo, { recursive: true }),
    mkdir(albumThree, { recursive: true }),
    mkdir(join(albumTwo, '.hidden'), { recursive: true }),
    mkdir(broken, { recursive: true })
  ])

  const taggedWav = join(albumOne, '01 Opening Tone.wav')
  const untaggedWav = join(albumOne, '02 untagged tone.wav')
  const taggedMp3 = join(albumTwo, '01 Cover Tone.mp3')
  const secondMp3 = join(albumTwo, '02 Second Tone.mp3')
  const losslessFlac = join(albumThree, '04 Lossless Field.flac')
  const coverPng = makePng(96, 96, 24)

  await Promise.all([
    writeFile(
      taggedWav,
      makeWav({
        durationSeconds: 8,
        frequency: 440,
        tags: { title: 'Opening Tone', artist: 'Bunny Test Ensemble', album: 'Signal Garden', year: '2019', track: '1', genre: 'Ambient' }
      })
    ),
    writeFile(untaggedWav, makeWav({ durationSeconds: 6, frequency: 330 })),
    writeFile(
      taggedMp3,
      makeMp3({
        durationSeconds: 12,
        frequency: 523,
        tags: { title: 'Cover Tone', artist: 'Bunny Test Ensemble', album: 'Artwork Sessions', year: '2021', track: '1', genre: 'Electronic' },
        coverPng,
        lyrics: 'Embedded line one\nEmbedded line two'
      })
    ),
    // Sidecar lyrics next to the WAV, which is how most local libraries carry
    // synced lyrics.
    writeFile(
      join(albumOne, '01 Opening Tone.lrc'),
      '[ar:Bunny Test Ensemble]\n[ti:Opening Tone]\n[00:00.00]First light over the garden\n[00:03.50]Signals in the wire\n[00:06.25]Opening tone\n'
    ),
    writeFile(
      secondMp3,
      makeMp3({
        durationSeconds: 10,
        frequency: 349,
        tags: { title: 'Second Tone', artist: 'Bunny Test Ensemble', album: 'Artwork Sessions', year: '2021', track: '2' },
        coverPng
      })
    ),
    writeFile(
      join(albumThree, '01 Midnight Signal.mp3'),
      makeMp3({
        durationSeconds: 14,
        frequency: 196,
        tags: { title: 'Midnight Signal', artist: 'Neon Cartography', album: 'Night Drive', year: '2024', track: '1', genre: 'Synthwave' },
        coverPng: makePng(96, 96, 96)
      })
    ),
    writeFile(
      join(albumThree, '02 Coastal Route.mp3'),
      makeMp3({
        durationSeconds: 11,
        frequency: 246,
        tags: { title: 'Coastal Route', artist: 'Neon Cartography', album: 'Night Drive', year: '2024', track: '2', genre: 'Synthwave' },
        coverPng: makePng(96, 96, 96)
      })
    ),
    writeFile(
      join(albumThree, '03 Homewards.mp3'),
      makeMp3({
        durationSeconds: 9,
        frequency: 293,
        tags: { title: 'Homewards', artist: 'Neon Cartography', album: 'Night Drive', year: '2024', track: '3', genre: 'Synthwave' },
        coverPng: makePng(96, 96, 96)
      })
    ),
    makeFlac({
      durationSeconds: 9,
      frequency: 392,
      tags: {
        title: 'Lossless Field',
        artist: 'Neon Cartography',
        album: 'Night Drive',
        year: '2024',
        track: '4',
        genre: 'Synthwave'
      }
    }).then((buffer) => writeFile(losslessFlac, buffer)),
    writeFile(join(albumTwo, '.hidden', 'should-not-scan.wav'), makeWav({ durationSeconds: 0.2 })),
    writeFile(join(broken, 'corrupt.m4a'), Buffer.from('this is definitely not an mp4 container '.repeat(60), 'latin1')),
    writeFile(join(broken, 'empty.wav'), Buffer.alloc(0)),
    writeFile(join(broken, 'unsupported.wma'), Buffer.from('0&\xb2u...fake wma', 'latin1')),
    writeFile(join(broken, 'notes.txt'), 'not audio')
  ])

  return {
    root,
    albumOne,
    albumTwo,
    albumThree,
    broken,
    taggedWav,
    untaggedWav,
    taggedMp3,
    secondMp3,
    losslessFlac,
    coverPng
  }
}
