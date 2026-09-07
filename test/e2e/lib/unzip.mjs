import { inflateRawSync } from 'node:zlib'

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
