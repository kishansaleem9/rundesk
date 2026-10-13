/**
 * HOW THE SPREADSHEET IMPORT READS THIS FILE, IF AT ALL (`ledger-rows/row-816`).
 *
 * The import reads ClickUp's six — .csv, .tsv, .txt, .xlsx, .xls and .json —
 * in two ways:
 *   · `text`: delimited text, read by the page and sent as it always was;
 *   · `file`: a workbook or a JSON list, uploaded as it is and read by the
 *     server (`sheet-file.ts` there), since a workbook's bytes do not survive
 *     being read as text (`found-5-oct/xlsx-read-as-text`: read so, a zip's
 *     bytes were drawn as a column and its run failed).
 *
 * Two things are asked before the page reads anything:
 *   · its NAME — one of the extensions the server says it reads
 *     (`acceptedExtensions`); anything else, a PDF or a Word document put in
 *     through the picker's "All files", is refused (null);
 *   · its FIRST BYTES — a zip (an .xlsx) starts "PK" and one of its three
 *     signatures (03 04, 05 06, 07 08), and a legacy .xls is an OLE2 compound
 *     file, D0 CF 11 E0 A1 B1 1A E1: whatever such a file is called, it is
 *     uploaded and read as the workbook it is. "PK" alone is not the test: a
 *     sheet whose first column is "PK" is a CSV.
 */
const UPLOADED = ['.xlsx', '.xls', '.json']

export async function sheetFileKind(
  file: Pick<Blob, 'slice'> & { name: string },
  accepted: readonly string[],
): Promise<'text' | 'file' | null> {
  const name = file.name.toLowerCase()
  if (!accepted.some((ext) => name.endsWith(ext.toLowerCase()))) return null
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  if (isZipSignature(head) || isCompoundFileSignature(head)) return 'file'
  return UPLOADED.some((ext) => name.endsWith(ext)) ? 'file' : 'text'
}

/** "PK" and one of the three zip signatures, from a file's first four bytes. */
export function isZipSignature(head: Uint8Array): boolean {
  if (head.length < 4 || head[0] !== 0x50 || head[1] !== 0x4b) return false
  return (
    (head[2] === 0x03 && head[3] === 0x04) ||
    (head[2] === 0x05 && head[3] === 0x06) ||
    (head[2] === 0x07 && head[3] === 0x08)
  )
}

/**
 * The eight bytes an OLE2 compound file — a legacy .xls — begins with. A real
 * one (written by xlwt) renamed .csv was taken by the page, and its preview
 * drew five column names of binary (measured on lane 4).
 */
const COMPOUND_FILE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

export function isCompoundFileSignature(head: Uint8Array): boolean {
  return head.length >= COMPOUND_FILE.length && COMPOUND_FILE.every((b, i) => head[i] === b)
}

/**
 * ONLY THE LAST FILE CHOSEN IS READ INTO THE PAGE. A file is read after an
 * await (its first bytes) and then by a `FileReader`, so a large file chosen
 * and then replaced by one the page refused still finished its read
 * afterwards: the page said the second was refused and kept no file line, yet
 * offered Preview — and Preview sent the first file, 21 MB of it (measured on
 * lane 4). Each choice takes a turn (`next`); a read whose turn is no longer
 * the latest (`isLatest`) is dropped, refused choices included.
 */
export function createPickTurns() {
  let latest = 0
  return {
    next: (): number => ++latest,
    isLatest: (turn: number): boolean => turn === latest,
  }
}
