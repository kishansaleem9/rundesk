import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib'

/**
 * Enough of a ZIP reader to open an .xlsx in a test, with no dependency.
 *
 * The point is not to be a general unzip. It is that the xlsx check in
 * `list-export.mjs` has to look INSIDE the workbook: "the response starts with
 * PK" would pass for any zip at all, including one whose sheet says the wrong
 * thing or is not valid XML. A test that cannot read the file it is asserting
 * about is a test that asserts the response was not empty.
 *
 * Reads the central directory rather than scanning local headers, because the
 * central directory is the authority on what is in the archive — a scan can be
 * fooled by a filename that happens to contain the local-header signature.
 */

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50
const LOC_SIG = 0x04034b50

/** @returns {Map<string, Buffer>} entry name → uncompressed bytes */
export function unzip(buf) {
  // The end-of-central-directory record is the last 22 bytes unless there is a
  // comment; scan back over the comment's maximum length to find it.
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break }
  }
  if (eocd === -1) throw new Error('not a zip: no end-of-central-directory record')

  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out = new Map()

  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(p) !== CEN_SIG) throw new Error(`bad central directory entry at ${p}`)
    const method = buf.readUInt16LE(p + 10)
    const compressedSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')

    if (buf.readUInt32LE(localOffset) !== LOC_SIG) {
      throw new Error(`entry ${name} does not point at a local header`)
    }
    // The local header repeats the name and extra fields, and its extra field
    // length can differ from the central one — read the local one.
    const locNameLen = buf.readUInt16LE(localOffset + 26)
    const locExtraLen = buf.readUInt16LE(localOffset + 28)
    const dataAt = localOffset + 30 + locNameLen + locExtraLen
    const raw = buf.subarray(dataAt, dataAt + compressedSize)

    out.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw))
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

/**
 * EVERY ENTRY, IN THE CENTRAL DIRECTORY'S ORDER, as a list — for an archive
 * whose ORDER and REPEATS are what is being checked (a task's "Download all",
 * `found-30-sep/attachments-have-no-download-all`). `unzip` above answers a
 * Map, which folds two entries of one name into one and so cannot see a zip
 * that has them.
 *
 * Each entry says whether its bytes' CRC-32 is the one the directory records:
 * a writer that got the CRC wrong makes an archive a real `unzip` refuses, and
 * reading the bytes back alone would never notice.
 *
 * @returns {Array<{ name: string, data: Buffer, method: number, flags: number, crcOk: boolean }>}
 */
export function unzipEntries(buf) {
  let eocd = -1
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIG) { eocd = i; break }
  }
  if (eocd === -1) throw new Error('not a zip: no end-of-central-directory record')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out = []
  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(p) !== CEN_SIG) throw new Error(`bad central directory entry at ${p}`)
    const flags = buf.readUInt16LE(p + 8)
    const method = buf.readUInt16LE(p + 10)
    const crc = buf.readUInt32LE(p + 16)
    const compressedSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')
    if (buf.readUInt32LE(localOffset) !== LOC_SIG) throw new Error(`entry ${name} does not point at a local header`)
    const dataAt = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28)
    const raw = buf.subarray(dataAt, dataAt + compressedSize)
    const data = method === 0 ? Buffer.from(raw) : inflateRawSync(raw)
    out.push({ name, data, method, flags, crcOk: crc32(data) === crc })
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

/**
 * The cell values of the first worksheet, row by row, read out of the inline
 * strings this exporter writes. Deliberately literal: it does NOT resolve a
 * shared-string table, so if the writer ever switched to one this returns
 * empty cells and the suite fails loudly rather than passing on a file nobody
 * can read.
 */
export function xlsxRows(buf) {
  const sheet = unzip(buf).get('xl/worksheets/sheet1.xml')
  if (!sheet) throw new Error('no xl/worksheets/sheet1.xml in the workbook')
  const xml = sheet.toString('utf8')
  const rows = []
  for (const row of xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? []) {
    const cells = []
    for (const cell of row.match(/<c\b[^>]*>[\s\S]*?<\/c>/g) ?? []) {
      const text = cell.match(/<t\b[^>]*>([\s\S]*?)<\/t>/)
      cells.push(
        text
          ? text[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
          : '',
      )
    }
    rows.push(cells)
  }
  return { xml, rows }
}

/**
 * AND A ZIP WRITTEN, for a suite to hand an importer the archive another tool
 * exports (`commit-log/log-601eacc-2`): Confluence's space export, Slack's
 * workspace export. Deflated, UTF-8 names, no data descriptors — the shape
 * `unzip` above and the API's own reader both take.
 *
 * @param {Record<string, string | Buffer>} entries name → contents
 * @returns {Buffer}
 */
export function zip(entries) {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, body] of Object.entries(entries)) {
    const data = typeof body === 'string' ? Buffer.from(body, 'utf8') : body
    const packed = deflateRawSync(data)
    const nameBytes = Buffer.from(name, 'utf8')
    const crc = crc32(data) >>> 0
    const local = Buffer.alloc(30)
    local.writeUInt32LE(LOC_SIG, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(CEN_SIG, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBytes, packed)
    centrals.push(central, nameBytes)
    offset += local.length + nameBytes.length + packed.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(EOCD_SIG, 0)
  end.writeUInt16LE(Object.keys(entries).length, 8)
  end.writeUInt16LE(Object.keys(entries).length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}
