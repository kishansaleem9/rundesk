import { Readable, Transform, pipeline } from 'node:stream'
import * as zlib from 'node:zlib'

/*
 * CRC-32, NODE'S OWN WHERE IT HAS ONE. `zlib.crc32` arrived in Node 22.2 and
 * 20.15. The API's image is `node:20-alpine` and `engines` allows any 20, so
 * where it is missing a table-driven one stands in; otherwise the route would
 * throw on the first file it read. The two agree (zip-stream.test.ts).
 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
export function crc32Table(data: Uint8Array, value = 0): number {
  let c = (value ^ 0xffffffff) >>> 0
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const nodeCrc32 = (zlib as { crc32?: (data: Uint8Array, value?: number) => number }).crc32
const crc32: (data: Uint8Array, value?: number) => number = typeof nodeCrc32 === 'function' ? nodeCrc32 : crc32Table
const { createDeflateRaw } = zlib

/**
 * A ZIP ARCHIVE WRITTEN AS IT IS READ, with no dependency
 * (`found-30-sep/attachments-have-no-download-all`).
 *
 * `xlsx.ts` has a ZIP writer of its own, and it is the wrong shape for a
 * task's files: it takes every entry as a Buffer and returns the archive as
 * one. A task's files are objects in the store, up to 100 MB each, and holding
 * them whole to write sizes and a CRC in front of them would hold the whole
 * archive in the API's memory.
 *
 * So each entry says "sizes and CRC to follow" (general purpose bit 3) and is
 * followed by a DATA DESCRIPTOR, as APPNOTE 4.3.9 describes: the local header
 * carries zeros, the bytes go out as they arrive from the store, the CRC and
 * the sizes are counted on the way, and they are written after the bytes and
 * again in the central directory, which is what a reader trusts. Nothing here
 * holds more than a chunk of any entry.
 *
 * STORE OR DEFLATE, per entry. A photo, a PDF or a video is compressed already
 * and deflating it again spends CPU to make it no smaller; text shrinks.
 *
 * NO ZIP64. A size or an offset of 0xFFFFFFFF means "look in the Zip64 record",
 * and there are 65 535 entries at most. The caller caps what it asks for
 * (`maxBytes`), and this refuses to go past either limit whatever it is asked:
 * it stops with a `ZipLimitError` rather than write an archive a reader would
 * take for whole and could not open.
 *
 * Names are written as they are given, as UTF-8 (bit 11). Making them safe and
 * distinct is the caller's (`zip-names.ts`).
 */

export type ZipMethod = 'store' | 'deflate'

export type ZipEntry = {
  /** The entry's name in the archive: one safe name, already distinct from the others (`uniqueEntryNames`). */
  name: string
  /**
   * The entry's bytes, opened when its turn comes, so only one entry is being
   * read at a time. Null when there is nothing there to read: the entry is left
   * out, and the archive is still whole.
   */
  open: () => Promise<Readable | Uint8Array | null>
  method?: ZipMethod
  modifiedAt?: Date
}

export type ZipOptions = {
  /**
   * The most the entries may hold together, before compression. Past it the
   * archive stops with a `ZipLimitError`. Never more than a ZIP32 size can say.
   */
  maxBytes?: number
}

/** The archive would pass what the caller allowed, or what an archive without Zip64 can hold. */
export class ZipLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZipLimitError'
  }
}

/** The largest size or offset a ZIP32 field can hold: 0xFFFFFFFF itself means "see the Zip64 record". */
export const ZIP32_MAX_BYTES = 0xfffffffe
/** And the most entries: 0xFFFF means the same. */
export const ZIP32_MAX_ENTRIES = 0xfffe

const LOCAL_FILE_HEADER = 0x04034b50
const DATA_DESCRIPTOR = 0x08074b50
const CENTRAL_DIRECTORY_HEADER = 0x02014b50
const END_OF_CENTRAL_DIRECTORY = 0x06054b50

/** Version 2.0: deflate, and a data descriptor. */
const VERSION_NEEDED = 20
/** Made on Unix (3), to 2.0, so the external attributes below read as a Unix mode. */
const VERSION_MADE_BY = (3 << 8) | 20
/** Bit 3: the CRC and the sizes follow the data. Bit 11: the name is UTF-8. */
const FLAGS = 0x0008 | 0x0800
/** A regular file, rw-r--r--, in the high half. */
const EXTERNAL_ATTRIBUTES = (0o100644 << 16) >>> 0

const METHOD_CODE: Record<ZipMethod, number> = { store: 0, deflate: 8 }

/**
 * The MS-DOS date and time a ZIP entry carries, from the instant's UTC fields.
 * It has no zone and a two-second step, and cannot say anything before 1980 or
 * after 2107, so those are held at the ends.
 */
export function dosDateTime(at: Date | undefined): { time: number; date: number } {
  const ms = at instanceof Date ? at.getTime() : Number.NaN
  if (!Number.isFinite(ms)) return { time: 0, date: (1 << 5) | 1 }
  const d = new Date(ms)
  const year = d.getUTCFullYear()
  if (year < 1980) return { time: 0, date: (1 << 5) | 1 }
  if (year > 2107) return { time: (23 << 11) | (59 << 5) | 29, date: (127 << 9) | (12 << 5) | 31 }
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  }
}

function localHeader(name: Buffer, method: number, at: { time: number; date: number }): Buffer {
  const b = Buffer.alloc(30 + name.length)
  b.writeUInt32LE(LOCAL_FILE_HEADER, 0)
  b.writeUInt16LE(VERSION_NEEDED, 4)
  b.writeUInt16LE(FLAGS, 6)
  b.writeUInt16LE(method, 8)
  b.writeUInt16LE(at.time, 10)
  b.writeUInt16LE(at.date, 12)
  // CRC-32, compressed size and size: zero here, and in the descriptor after the data (bit 3).
  b.writeUInt32LE(0, 14)
  b.writeUInt32LE(0, 18)
  b.writeUInt32LE(0, 22)
  b.writeUInt16LE(name.length, 26)
  b.writeUInt16LE(0, 28)
  name.copy(b, 30)
  return b
}

function dataDescriptor(crc: number, compressed: number, size: number): Buffer {
  const b = Buffer.alloc(16)
  b.writeUInt32LE(DATA_DESCRIPTOR, 0)
  b.writeUInt32LE(crc >>> 0, 4)
  b.writeUInt32LE(compressed, 8)
  b.writeUInt32LE(size, 12)
  return b
}

function centralHeader(
  name: Buffer,
  method: number,
  at: { time: number; date: number },
  crc: number,
  compressed: number,
  size: number,
  offset: number,
): Buffer {
  const b = Buffer.alloc(46 + name.length)
  b.writeUInt32LE(CENTRAL_DIRECTORY_HEADER, 0)
  b.writeUInt16LE(VERSION_MADE_BY, 4)
  b.writeUInt16LE(VERSION_NEEDED, 6)
  b.writeUInt16LE(FLAGS, 8)
  b.writeUInt16LE(method, 10)
  b.writeUInt16LE(at.time, 12)
  b.writeUInt16LE(at.date, 14)
  b.writeUInt32LE(crc >>> 0, 16)
  b.writeUInt32LE(compressed, 20)
  b.writeUInt32LE(size, 24)
  b.writeUInt16LE(name.length, 28)
  b.writeUInt16LE(0, 30) // extra field
  b.writeUInt16LE(0, 32) // comment
  b.writeUInt16LE(0, 34) // disk
  b.writeUInt16LE(0, 36) // internal attributes
  b.writeUInt32LE(EXTERNAL_ATTRIBUTES, 38)
  b.writeUInt32LE(offset, 42)
  name.copy(b, 46)
  return b
}

function endOfCentralDirectory(count: number, size: number, offset: number): Buffer {
  const b = Buffer.alloc(22)
  b.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0)
  b.writeUInt16LE(0, 4)
  b.writeUInt16LE(0, 6)
  b.writeUInt16LE(count, 8)
  b.writeUInt16LE(count, 10)
  b.writeUInt32LE(size, 12)
  b.writeUInt32LE(offset, 16)
  b.writeUInt16LE(0, 20)
  return b
}

/** What one entry's bytes came to, counted as they pass. */
type Tally = { crc: number; size: number }

function asStream(source: Readable | Uint8Array): Readable {
  // `Readable.from` hands a Buffer on as ONE chunk rather than iterating its bytes.
  return source instanceof Readable ? source : Readable.from([Buffer.from(source.buffer, source.byteOffset, source.byteLength)])
}

/** The entry's bytes as they are, counted. Stopping early lets the source go (its iterator destroys it). */
async function* stored(source: Readable, tally: Tally, count: (n: number) => void): AsyncGenerator<Buffer> {
  for await (const chunk of source) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    count(bytes.length)
    tally.crc = crc32(bytes, tally.crc)
    tally.size += bytes.length
    yield bytes
  }
}

/**
 * The entry's bytes through DEFLATE, counted before they are compressed. One
 * pipeline, so an error anywhere — the store, the count, zlib — destroys every
 * stream in it and surfaces where the output is read, and a reader that stops
 * early destroys the output and with it the source.
 */
function deflated(source: Readable, tally: Tally, count: (n: number) => void): Readable {
  const counting = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      try {
        count(chunk.length)
        tally.crc = crc32(chunk, tally.crc)
        tally.size += chunk.length
        done(null, chunk)
      } catch (err) {
        done(err as Error)
      }
    },
  })
  return pipeline(source, counting, createDeflateRaw(), () => {
    /* errors reach the reader of the returned stream */
  })
}

/**
 * The archive, chunk by chunk, for `Readable.from(zipStream(…))`. Entries are
 * written in the order given, each opened only when its turn comes.
 */
export async function* zipStream(
  entries: Iterable<ZipEntry> | AsyncIterable<ZipEntry>,
  options: ZipOptions = {},
): AsyncGenerator<Buffer> {
  const maxBytes = Math.min(options.maxBytes ?? ZIP32_MAX_BYTES, ZIP32_MAX_BYTES)
  const directory: Buffer[] = []
  let offset = 0
  let count = 0
  let total = 0
  const countBytes = (n: number) => {
    total += n
    if (total > maxBytes) throw new ZipLimitError(`the entries hold more than the ${maxBytes} bytes this archive may`)
  }
  // Every field an offset or a size is written into holds 32 bits.
  const addressable = (at: number) => {
    if (at > ZIP32_MAX_BYTES) throw new ZipLimitError('the archive would pass what an archive without Zip64 can address')
  }

  for await (const entry of entries) {
    const opened = await entry.open()
    if (opened === null) continue
    const source = asStream(opened)
    if (count >= ZIP32_MAX_ENTRIES) {
      source.destroy()
      throw new ZipLimitError(`an archive without Zip64 holds ${ZIP32_MAX_ENTRIES} entries at most`)
    }
    const name = Buffer.from(entry.name, 'utf8')
    if (name.length === 0 || name.length > 0xffff) {
      source.destroy()
      throw new ZipLimitError(`an entry's name must be 1 to 65535 bytes, not ${name.length}`)
    }
    const method = METHOD_CODE[entry.method ?? 'store']
    const at = dosDateTime(entry.modifiedAt)
    const headerAt = offset
    const header = localHeader(name, method, at)
    addressable(offset + header.length)
    yield header
    offset += header.length

    const tally: Tally = { crc: 0, size: 0 }
    let written = 0
    const body = method === METHOD_CODE.deflate ? deflated(source, tally, countBytes) : stored(source, tally, countBytes)
    for await (const chunk of body) {
      written += chunk.length
      addressable(offset + written)
      yield chunk
    }
    offset += written

    const descriptor = dataDescriptor(tally.crc, written, tally.size)
    addressable(offset + descriptor.length)
    yield descriptor
    offset += descriptor.length
    directory.push(centralHeader(name, method, at, tally.crc, written, tally.size, headerAt))
    count += 1
  }

  const central = Buffer.concat(directory)
  addressable(offset + central.length)
  yield central
  yield endOfCentralDirectory(count, central.length, offset)
}
