/**
 * CLICKUP'S CURRENT TASK EXPORT, READ AS IT IS WRITTEN (`found-02-nov/clickup-current-export-unread`).
 *
 * ClickUp's classic export (`clickup-export.ts`) writes `[a,b]` lists and plain
 * numbers. Its current one — Settings › Imports / Exports › Export, its header
 * row naming `Task Content`, `Folder Name/Path` and `Home Location` — writes
 * cells otherwise, read from the owner's own export of 59,318 rows (2 November)
 * and the CSV's own first lines:
 *
 *   · an empty cell is `null`, `NaN`, `[]`, `{}` or `""` as often as it is empty;
 *   · Task Content keeps its line breaks as the two characters `\n`, and a rich
 *     text one is Quill's JSON (`{"ops":[{"insert":…}]}`);
 *   · Folder Name/Path is a JSON list (a Folder, then its Subfolders);
 *   · Checklists is a JSON object, each checklist's name holding its items;
 *   · numbers are plain in the CSV (`1750967227037`, Priority `2`) except Time
 *     Spent, written with a space before its quotes (` "900000"`), and in the
 *     .xlsx they are written as Java writes a double (`1.750967227037E12`,
 *     `2.0`, `900000.0`);
 *   · Home Location is where the task lives (`Space > Folder > List`, or
 *     `Space > List`); Space Name, Folder Name/Path and List Name are not, for
 *     a task also in another List or "Shared with me".
 *
 * So such a file is cleaned once, as it is read: the review grid shows what
 * will be imported, and everything after the reader sees ordinary cells.
 */

import type { SheetTable } from './table'

const key = (header: string) => header.trim().toLowerCase().replace(/\s+/g, ' ')

/** Its header row names Task Content and Home Location, which no other export here writes together. */
export function isClickUpCurrentExport(headers: readonly string[]): boolean {
  const names = new Set(headers.map(key))
  return names.has('task content') && names.has('home location')
}

/** How the current export writes an empty cell. */
const EMPTY = /^(null|nan|undefined|\[\]|\{\}|"")$/i

/** Its columns of numbers: milliseconds, Priority's 1–4, counts and ids. */
const NUMBER_COLUMNS = new Set([
  'date created',
  'due date',
  'start date',
  'date closed',
  'date done',
  'date updated',
  'time estimated',
  'time spent',
  'rolled up time',
  'priority',
  'assigned comments',
  'home location id',
])

/** A number as the .xlsx writes it (`1.750967227037E12`, `2.0`), or the CSV's Time Spent (` "900000"`), as a whole number. */
export function clickupNumber(raw: string): string {
  let v = raw.trim()
  if (/^"[^"]*"$/.test(v)) v = v.slice(1, -1).trim()
  if (EMPTY.test(v) || v === '') return ''
  if (!/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(v)) return v
  const n = Number(v)
  return Number.isFinite(n) ? String(Math.round(n)) : v
}

/** Task Content: its `\n` pairs as line breaks, and a Quill delta as the text it inserts. */
export function clickupContent(raw: string): string {
  const v = raw.trim()
  if (EMPTY.test(v)) return ''
  if (v.startsWith('{"ops"')) {
    try {
      const ops = (JSON.parse(v) as { ops?: Array<{ insert?: unknown }> }).ops ?? []
      return ops
        .map((op) => (typeof op.insert === 'string' ? op.insert : ''))
        .join('')
        .trim()
    } catch {
      /* not Quill after all: read as text below */
    }
  }
  return v.replace(/\\r\\n|\\n|\\r/g, '\n')
}

/** Folder Name/Path, `["Folder","Subfolder"]`, as `Folder > Subfolder`. */
function folderPath(raw: string): string {
  const v = raw.trim()
  if (EMPTY.test(v)) return ''
  try {
    const parts = JSON.parse(v)
    if (Array.isArray(parts)) return parts.filter((p) => typeof p === 'string' && p.trim()).join(' > ')
  } catch {
    /* written some other way: leave it */
  }
  return v
}

/** Each cell as the rest of the importer reads a cell. The Task Name stays a name: only its `\n` pairs become spaces. */
export function normaliseClickUpCurrentExport(table: SheetTable): SheetTable {
  const columns = table.headers.map(key)
  const rows = table.rows.map((row) => ({
    line: row.line,
    cells: row.cells.map((cell, i) => {
      const column = columns[i]
      if (column === 'task name') return cell.replace(/\\r\\n|\\n|\\r/g, ' ').replace(/\s{2,}/g, ' ').trim()
      if (column === 'task content') return clickupContent(cell)
      if (column === 'folder name/path') return folderPath(cell)
      if (NUMBER_COLUMNS.has(column)) return clickupNumber(cell)
      return EMPTY.test(cell.trim()) ? '' : cell
    }),
  }))
  return { headers: table.headers, rows }
}
