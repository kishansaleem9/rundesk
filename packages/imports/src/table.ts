/**
 * The one shape every file reader produces: a header row plus numbered data
 * rows. CSV, TSV, TXT, XLSX and JSON all arrive here, so everything after the
 * reader (mapping, validation, the grid, the writer) is format-blind.
 */

export type SheetRow = {
  /** 1-based line (or sheet row) in the uploaded file. Line 1 is the header. */
  line: number
  cells: string[]
}

export type SheetTable = {
  headers: string[]
  rows: SheetRow[]
}

/**
 * §2.4 — "There is a 10,000-row limit for imported spreadsheets." That is
 * ClickUp's number. Rundesk takes 100,000 at the owner's word: 50,000 on 28
 * October, then 100,000 on 2 November, when the owner's own ClickUp export
 * held 59,318 rows. The engine works in chunks and batches throughout
 * (measured at 50,000: the run 98 s, the API's memory 785 MB). The API's
 * limit is this one too.
 */
export const MAX_SHEET_ROWS = 100_000

/** The refusal past a row limit, the number written as the limit is (`100,000`), in whichever place refuses. */
export function tooManyRows(limit: number): string {
  return `There is a ${String(limit).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}-row limit for imported spreadsheets. Split your file into batches.`
}

export type SheetReadErrorCode =
  | 'unsupported_type'
  | 'xls_unsupported'
  | 'empty_file'
  | 'no_header'
  | 'duplicate_headers'
  | 'too_many_rows'
  | 'unreadable'

export class SheetReadError extends Error {
  constructor(
    readonly code: SheetReadErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'SheetReadError'
  }
}

export const SHEET_READ_MESSAGES: Record<SheetReadErrorCode, string> = {
  unsupported_type: 'This file type cannot be imported. Use .xlsx, .csv, .tsv, .txt or .json.',
  xls_unsupported: 'Older .xls workbooks cannot be read. Save the sheet as .xlsx or .csv and upload it again.',
  empty_file: 'The file is empty.',
  no_header: 'The first row must be a header row naming each column.',
  duplicate_headers: 'Column headers must be unique.',
  too_many_rows: tooManyRows(MAX_SHEET_ROWS),
  unreadable: 'The file could not be read. It may be damaged or password-protected.',
}

/**
 * Header checks shared by every reader (§2.4): a header row is required and
 * its names must be unique. Blank header cells are named after their column so
 * they can still be mapped or skipped by hand.
 */
export function finishTable(headers: string[], rows: SheetRow[]): SheetTable {
  const named = headers.map((h, i) => (h.trim() === '' ? `Column ${i + 1}` : h.trim()))
  if (named.length === 0 || headers.every((h) => h.trim() === '')) {
    throw new SheetReadError('no_header', SHEET_READ_MESSAGES.no_header)
  }
  const seen = new Set<string>()
  const dupes: string[] = []
  for (const h of named) {
    const key = h.toLowerCase()
    if (seen.has(key)) dupes.push(h)
    seen.add(key)
  }
  if (dupes.length) {
    throw new SheetReadError(
      'duplicate_headers',
      `${SHEET_READ_MESSAGES.duplicate_headers} Repeated: ${[...new Set(dupes)].join(', ')}.`,
    )
  }
  // A wholly blank row is nothing, not a task: it neither counts towards the
  // limit nor appears in the grid.
  const kept = rows.filter((r) => r.cells.some((c) => c.trim() !== ''))
  if (kept.length > MAX_SHEET_ROWS) {
    throw new SheetReadError('too_many_rows', SHEET_READ_MESSAGES.too_many_rows)
  }
  return { headers: named, rows: kept }
}
