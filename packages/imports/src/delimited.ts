import { finishTable, type SheetRow, type SheetTable } from './table'

export type Delimiter = ',' | '\t' | ';' | '|'

const CANDIDATES: Delimiter[] = [',', '\t', ';', '|']

/**
 * One pass over the whole text, so a quoted cell may hold the delimiter, a
 * doubled quote or a newline (RFC 4180). Splitting into lines first and then
 * into cells cannot tell a newline inside quotes from a row break.
 */
export function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuote = false
  let i = 0
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  while (i < src.length) {
    const ch = src[i]
    if (inQuote) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i += 2
          continue
        }
        inQuote = false
        i++
        continue
      }
      cell += ch
      i++
      continue
    }
    if (ch === '"' && cell === '') {
      inQuote = true
      i++
      continue
    }
    if (ch === delimiter) {
      row.push(cell)
      cell = ''
      i++
      continue
    }
    if (ch === '\r' || ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      i += ch === '\r' && src[i + 1] === '\n' ? 2 : 1
      continue
    }
    cell += ch
    i++
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

/** The candidate that appears most often outside quotes on the header line. */
export function detectDelimiter(text: string): Delimiter {
  let header = ''
  let inQuote = false
  for (const ch of text.charCodeAt(0) === 0xfeff ? text.slice(1) : text) {
    if (ch === '"') inQuote = !inQuote
    if (!inQuote && (ch === '\n' || ch === '\r')) break
    header += ch
  }
  let best: Delimiter = ','
  let bestCount = 0
  for (const d of CANDIDATES) {
    let count = 0
    let quoted = false
    for (const ch of header) {
      if (ch === '"') quoted = !quoted
      else if (ch === d && !quoted) count++
    }
    if (count > bestCount) {
      best = d
      bestCount = count
    }
  }
  return best
}

/** CSV / TSV / TXT → table. `.tsv` is tab by definition; the rest are sniffed. */
export function readDelimited(text: string, delimiter?: Delimiter): SheetTable {
  const delim = delimiter ?? detectDelimiter(text)
  const [header = [], ...data] = parseDelimitedRows(text, delim)
  const rows: SheetRow[] = data.map((cells, i) => ({ line: i + 2, cells }))
  return finishTable(header, rows)
}
