import * as zlib from 'node:zlib'
import { crc32Table } from '../export/zip-stream'

/**
 * A ZIP ARCHIVE READ BACK, with no dependency (`commit-log/log-601eacc-2`).
 *
 * What the importers are handed is a zip four times over: an .xlsx and a .docx
 * are zips of XML parts, Confluence's space export is a zip of HTML pages, and
 * Slack's export is a zip of JSON. `zip-stream.ts` writes the format; this is
 * the same format read, through the central directory, as APPNOTE 4.3.12 says a
 * reader should: the local headers may carry zeros and a data descriptor, the
 * central directory never does.
 *
 * STORE OR DEFLATE, as the writer. Anything else (bzip2, LZMA, an encrypted
 * entry) is refused in words, not misread.
 *
 * ZIP64 IS READ. A Confluence space of many pages passes 65 535 entries or
 * 4 GB well before ClickUp's 2.5 GB limit says no, and a 0xFFFFFFFF in a size
 * or an offset means "look in the Zip64 record", not "four gigabytes".
 *
 * NOTHING IS TRUSTED THAT A CRAFTED ARCHIVE CAN SAY. An entry's declared size
 * is checked against the caller's limits before it is inflated, the inflater is
 * told to stop past that size whatever the header said (a "zip bomb" declares
 * a small size and inflates to gigabytes), and what comes out must match both
 * the declared size and the CRC. Names are only keys here: nothing is written
 * to disk, so a `../` in one reaches nothing.
 */

export class ZipReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZipReadError'
  }
}

export type ZipLimits = {
  /** The most entries an archive may hold. */
  maxEntries?: number
  /** The most one entry may hold, inflated. */
  maxEntryBytes?: number
  /** The most every entry together may hold, inflated. */
  maxTotalBytes?: number
}

export type ZipEntry = {
  /** Its name in the archive, `/`-separated, as the archive spells it. */
  name: string
  /** Inflated size, as the central directory declares it. */
  size: number
  /** Its bytes, inflated and checked. Read on demand, so an archive's unwanted entries cost nothing. */
  read(): Buffer
  /** Its bytes as UTF-8 text, without a byte-order mark. */
  text(): string
}

const LOCAL_FILE_HEADER = 0x04034b50
const CENTRAL_DIRECTORY_HEADER = 0x02014b50
const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const ZIP64_END_OF_CENTRAL_DIRECTORY = 0x06064b50
const ZIP64_LOCATOR = 0x07064b50

const DEFAULTS: Required<ZipLimits> = {
  maxEntries: 50_000,
  maxEntryBytes: 200 * 1024 * 1024,
  maxTotalBytes: 1024 * 1024 * 1024,
}

const nodeCrc32 = (zlib as { crc32?: (data: Uint8Array, value?: number) => number }).crc32
const crc32 = typeof nodeCrc32 === 'function' ? nodeCrc32 : crc32Table

/** A zip by its first four bytes: a file's local header, or an empty archive's end record. */
export function isZip(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return false
  return (bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06)
}

/** Every file in the archive by name (folders left out), each read only when asked. */
export function readZip(buf: Buffer, limits: ZipLimits = {}): Map<string, ZipEntry> {
  const limit = { ...DEFAULTS, ...limits }
  if (!isZip(buf)) throw new ZipReadError('This file is not a zip archive')

  const eocd = findEndOfCentralDirectory(buf)
  if (eocd < 0) throw new ZipReadError('The archive has no central directory: it is cut short or damaged')
  if (buf.readUInt16LE(eocd + 4) !== 0 || buf.readUInt16LE(eocd + 6) !== 0) {
    throw new ZipReadError('A zip split across several files is not read: put it together into one first')
  }
  let count = buf.readUInt16LE(eocd + 10)
  let cdSize = buf.readUInt32LE(eocd + 12)
  let cdOffset = buf.readUInt32LE(eocd + 16)

  // The Zip64 end record, named by a locator just before the plain one.
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const locator = eocd - 20
    if (locator < 0 || buf.readUInt32LE(locator) !== ZIP64_LOCATOR) {
      throw new ZipReadError('The archive says it is Zip64 and has no Zip64 record')
    }
    const record = readUInt64(buf, locator + 8)
    if (record + 56 > buf.length || buf.readUInt32LE(record) !== ZIP64_END_OF_CENTRAL_DIRECTORY) {
      throw new ZipReadError('The archive’s Zip64 record is damaged')
    }
    count = readUInt64(buf, record + 32)
    cdSize = readUInt64(buf, record + 40)
    cdOffset = readUInt64(buf, record + 48)
  }
  if (count > limit.maxEntries) {
    throw new ZipReadError(`The archive holds ${count} files; at most ${limit.maxEntries} are read`)
  }
  if (cdOffset + cdSize > buf.length) throw new ZipReadError('The archive is cut short: its directory points past its end')

  const entries = new Map<string, ZipEntry>()
  let total = 0
  let at = cdOffset
  for (let i = 0; i < count; i++) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== CENTRAL_DIRECTORY_HEADER) {
      throw new ZipReadError('The archive’s directory is damaged')
    }
    const flags = buf.readUInt16LE(at + 8)
    const method = buf.readUInt16LE(at + 10)
    const crc = buf.readUInt32LE(at + 16)
    let compressed = buf.readUInt32LE(at + 20)
    let size = buf.readUInt32LE(at + 24)
    const nameLength = buf.readUInt16LE(at + 28)
    const extraLength = buf.readUInt16LE(at + 30)
    const commentLength = buf.readUInt16LE(at + 32)
    let localOffset = buf.readUInt32LE(at + 42)
    const nameBytes = buf.subarray(at + 46, at + 46 + nameLength)
    // Bit 11: UTF-8. Otherwise IBM 437, whose printable ASCII half is all a real name uses.
    const rawName = flags & 0x0800 ? nameBytes.toString('utf8') : nameBytes.toString('latin1')
    const extra = buf.subarray(at + 46 + nameLength, at + 46 + nameLength + extraLength)
    ;({ size, compressed, localOffset } = zip64Sizes(extra, { size, compressed, localOffset }))
    at += 46 + nameLength + extraLength + commentLength

    const name = rawName.replace(/\\/g, '/').replace(/^\.\//, '')
    if (!name || name.endsWith('/')) continue
    if (flags & 0x0001) throw new ZipReadError(`"${name}" is encrypted: export the archive without a password`)
    if (method !== 0 && method !== 8) {
      throw new ZipReadError(`"${name}" is compressed in a way this reader does not know (method ${method})`)
    }
    if (size > limit.maxEntryBytes) {
      throw new ZipReadError(`"${name}" holds ${size} bytes; at most ${limit.maxEntryBytes} are read from one file`)
    }
    total += size
    if (total > limit.maxTotalBytes) {
      throw new ZipReadError(`The archive holds more than ${limit.maxTotalBytes} bytes once inflated; this is as much as is read`)
    }

    const read = (): Buffer => {
      if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) {
        throw new ZipReadError(`"${name}" is damaged: its header is not where the directory says`)
      }
      const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28)
      if (start + compressed > buf.length) throw new ZipReadError(`"${name}" is cut short`)
      const stored = buf.subarray(start, start + compressed)
      let out: Buffer
      try {
        out = method === 0 ? Buffer.from(stored) : zlib.inflateRawSync(stored, { maxOutputLength: Math.max(size, 1) })
      } catch {
        throw new ZipReadError(`"${name}" could not be inflated: it is damaged, or larger than it says`)
      }
      if (out.length !== size) throw new ZipReadError(`"${name}" is ${out.length} bytes where the archive says ${size}`)
      if ((crc32(out) >>> 0) !== crc) throw new ZipReadError(`"${name}" is damaged: its checksum does not match`)
      return out
    }
    entries.set(name, {
      name,
      size,
      read,
      text: () => stripBom(read().toString('utf8')),
    })
  }
  return entries
}

/** The text without a leading byte-order mark, which Windows tools put in front of UTF-8. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/** The end record: its signature, searched from the end, past a comment of up to 65 535 bytes. */
function findEndOfCentralDirectory(buf: Buffer): number {
  const lowest = Math.max(0, buf.length - 22 - 0xffff)
  for (let i = buf.length - 22; i >= lowest; i--) {
    if (buf.readUInt32LE(i) === END_OF_CENTRAL_DIRECTORY) return i
  }
  return -1
}

function readUInt64(buf: Buffer, at: number): number {
  const low = buf.readUInt32LE(at)
  const high = buf.readUInt32LE(at + 4)
  // Past 2^53 no archive this reads could be: refused rather than rounded.
  if (high >= 0x200000) throw new ZipReadError('The archive declares a size past what can be read')
  return high * 0x100000000 + low
}

/**
 * The Zip64 extra field (0x0001): the 8-byte values for exactly those of the
 * size, the compressed size and the offset whose 4-byte field is 0xFFFFFFFF,
 * in that order (APPNOTE 4.5.3).
 */
function zip64Sizes(
  extra: Buffer,
  v: { size: number; compressed: number; localOffset: number },
): { size: number; compressed: number; localOffset: number } {
  if (v.size !== 0xffffffff && v.compressed !== 0xffffffff && v.localOffset !== 0xffffffff) return v
  let at = 0
  while (at + 4 <= extra.length) {
    const id = extra.readUInt16LE(at)
    const length = extra.readUInt16LE(at + 2)
    if (id === 0x0001) {
      let p = at + 4
      const next = (): number => {
        if (p + 8 > at + 4 + length) throw new ZipReadError('An entry’s Zip64 sizes are damaged')
        const value = readUInt64(extra, p)
        p += 8
        return value
      }
      const out = { ...v }
      if (v.size === 0xffffffff) out.size = next()
      if (v.compressed === 0xffffffff) out.compressed = next()
      if (v.localOffset === 0xffffffff) out.localOffset = next()
      return out
    }
    at += 4 + length
  }
  throw new ZipReadError('An entry says its sizes are in a Zip64 field and has none')
}
