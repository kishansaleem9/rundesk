import { readDelimited } from './delimited'
import { finishTable, SheetReadError, SHEET_READ_MESSAGES, type SheetRow, type SheetTable } from './table'
import { readXlsx } from './xlsx-reader'

/**
 * §2.4 — what the picker offers. `.xls` is listed so the person can choose it
 * and be told what to do with it, rather than the picker hiding their file.
 */
export const ACCEPTED_SHEET_EXTENSIONS = ['.xls', '.xlsx', '.csv', '.tsv', '.txt', '.json'] as const

export const GOOGLE_SHEETS_HINT = 'Google Sheets must be exported first: File → Download → .xlsx or .csv.'

type TextDecoderCtor = new (label?: string, opts?: { fatal?: boolean }) => { decode(bytes: Uint8Array): string }
const TextDecoderImpl = (globalThis as unknown as { TextDecoder: TextDecoderCtor }).TextDecoder

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot < 0 ? '' : fileName.slice(dot).toLowerCase()
}

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v)

/** UTF-8 first (with or without a BOM), UTF-16 by its BOM, and Windows-1252 as the last resort. */
export function decodeText(bytes: Uint8Array): string {
  if (startsWith(bytes, [0xff, 0xfe])) return new TextDecoderImpl('utf-16le').decode(bytes.subarray(2))
  if (startsWith(bytes, [0xfe, 0xff])) return new TextDecoderImpl('utf-16be').decode(bytes.subarray(2))
  try {
    return new TextDecoderImpl('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoderImpl('windows-1252').decode(bytes)
  }
}

function cellText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(cellText).filter(Boolean).join(', ')
  return JSON.stringify(value)
}

/** A JSON file is an array of objects (one task each); headers are every key, in first-seen order. */
export function readJsonSheet(text: string): SheetTable {
  let parsed: unknown
  try {
    parsed = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
  } catch {
    throw new SheetReadError('unreadable', 'The JSON file could not be parsed.')
  }
  const records = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown }).rows)
      ? (parsed as { rows: unknown[] }).rows
      : null
  if (!records || !records.every((r) => r && typeof r === 'object' && !Array.isArray(r))) {
    throw new SheetReadError('unreadable', 'A JSON import must be an array of objects, one per task.')
  }
  const headers: string[] = []
  const known = new Set<string>()
  for (const r of records as Record<string, unknown>[]) {
    for (const k of Object.keys(r)) {
      if (!known.has(k)) {
        known.add(k)
        headers.push(k)
      }
    }
  }
  const rows: SheetRow[] = (records as Record<string, unknown>[]).map((r, i) => ({
    line: i + 2,
    cells: headers.map((h) => cellText(r[h])),
  }))
  return finishTable(headers, rows)
}

/** Any accepted file → one table. Throws `SheetReadError` with a message fit to show as-is. */
export async function readSheetFile(fileName: string, bytes: Uint8Array): Promise<SheetTable> {
  if (bytes.length === 0) throw new SheetReadError('empty_file', SHEET_READ_MESSAGES.empty_file)
  const ext = extensionOf(fileName)
  // An OLE2 compound file: a legacy .xls (or an encrypted workbook), whatever it is named.
  if (ext === '.xls' || startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    throw new SheetReadError('xls_unsupported', SHEET_READ_MESSAGES.xls_unsupported)
  }
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return readXlsx(bytes)
  if (ext === '.xlsx' || ext === '.xlsm') throw new SheetReadError('unreadable', SHEET_READ_MESSAGES.unreadable)
  if (!['.csv', '.tsv', '.txt', '.json'].includes(ext)) {
    throw new SheetReadError('unsupported_type', SHEET_READ_MESSAGES.unsupported_type)
  }
  const text = decodeText(bytes)
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  if (firstLine.includes('\u0000')) throw new SheetReadError('unreadable', SHEET_READ_MESSAGES.unreadable)
  if (ext === '.json') return readJsonSheet(text)
  return readDelimited(text, ext === '.tsv' ? '\t' : undefined)
}
