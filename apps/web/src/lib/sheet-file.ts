/**
 * IS THIS FILE ONE THE SPREADSHEET IMPORT READS? (`found-5-oct/xlsx-read-as-text`)
 *
 * The page asked for a CSV — "Accepted: .csv · .tsv · .txt. .xlsx is not read
 * — re-save the sheet as CSV first." — and its file input's `accept` is only a
 * hint to the picker: the dialog's "All files", or a drop, put an .xlsx in
 * anyway. The page read it with `readAsText` and offered it: a preview drew
 * the zip's bytes as a column name, mapping that column to Title enabled
 * Start, and the run failed, leaving an empty space, project and list.
 *
 * So the page asks two things before it reads a file, and refuses it in the
 * words it already shows under the picker:
 *   · its NAME — one of the extensions the server says it reads
 *     (`acceptedExtensions`);
 *   · its FIRST BYTES — a spreadsheet saved in a binary format, whatever it is
 *     called: a zip (an .xlsx, an .ods, a .numbers) starts "PK" and one of its
 *     three signatures (03 04, 05 06, 07 08), and a legacy .xls is an OLE2
 *     compound file, D0 CF 11 E0 A1 B1 1A E1. "PK" alone is not the test: a
 *     sheet whose first column is "PK" is a CSV.
 *
 * The server asks the content's first bytes too (a zip, or a NUL in its first
 * line), so a file this missed is still refused there, in the same words.
 */
export async function isSheetFile(
  file: Pick<Blob, 'slice'> & { name: string },
  accepted: readonly string[],
): Promise<boolean> {
  const name = file.name.toLowerCase()
  if (!accepted.some((ext) => name.endsWith(ext.toLowerCase()))) return false
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  return !isZipSignature(head) && !isCompoundFileSignature(head)
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
