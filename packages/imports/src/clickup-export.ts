/**
 * §5.1 — the workspace task export, in ClickUp's own column format, so a
 * RUNDESK export imports into ClickUp and a ClickUp export imports here.
 *
 * The header row is written WITHOUT quotes (none of its names needs any), so
 * it is byte-identical to ClickUp's. Cells are quoted only when RFC 4180 needs
 * it, and a cell a spreadsheet would run as a formula (`=`, `+`, `-`, `@`) is
 * prefixed with `'` — except a plain number, which `-5` and `+44…` often are.
 */

import { formatDuration, type Priority } from './values'

export const CLICKUP_EXPORT_HEADERS = [
  'Task ID',
  'Task Link',
  'Task Type',
  'Task Custom ID',
  'Task Name',
  'Task Description',
  'Status',
  'Date created',
  'Date created Text',
  'Due date',
  'Due date Text',
  'Start date',
  'Start date Text',
  'Parent ID',
  'Subtask IDs',
  'Attachments',
  'Assignees',
  'Tags',
  'Priority',
  'List Name',
  'Folder Name',
  'Space Name',
  'Time Estimated',
  'Time Estimated Text',
  'Checklists',
  'Comments',
  'Assigned Comments',
  'Time Spent',
  'Time Spent Text',
  'Rolled Up Time',
  'Rolled Up Time Text',
] as const

/** §5.1 "Optional Date Format selector": it decides how each `… Text` twin is written. */
export type ExportDateFormat = 'normal' | 'iso' | 'posix'

export const EXPORT_DATE_FORMATS: ReadonlyArray<{ value: ExportDateFormat; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'iso', label: 'ISO' },
  { value: 'posix', label: 'POSIX' },
]

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/**
 * "Monday, May 30th, 2019, 4:00:00 am +00:00" — ClickUp's text form. Rendered
 * in UTC (as every RUNDESK export is), so the offset is always +00:00.
 */
export function clickUpDateText(ms: number): string {
  const d = new Date(ms)
  const h = d.getUTCHours()
  const twelve = h % 12 === 0 ? 12 : h % 12
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${DAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${ordinal(d.getUTCDate())}, ${d.getUTCFullYear()}, ` +
    `${twelve}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${h < 12 ? 'am' : 'pm'} +00:00`
  )
}

/** A date as its two cells: Unix ms, and the text twin in the chosen format. */
export function dateCells(value: Date | string | null | undefined, format: ExportDateFormat): [string, string] {
  if (value == null || value === '') return ['', '']
  const ms = value instanceof Date ? value.getTime() : Date.parse(value)
  if (Number.isNaN(ms)) return ['', '']
  const text = format === 'iso' ? new Date(ms).toISOString() : format === 'posix' ? String(ms) : clickUpDateText(ms)
  return [String(ms), text]
}

/** A duration as its two cells: ms, and `2h 30m`. Empty when there is none. */
export function durationCells(ms: number | null | undefined): [string, string] {
  if (!ms) return ['', '']
  return [String(ms), formatDuration(ms)]
}

/** `[John Smith,Mary Smith]` — ClickUp's bracketed list, no spaces after the commas. */
export function bracketList(values: string[]): string {
  return values.length ? `[${values.join(',')}]` : ''
}

export function attachmentsCell(files: Array<{ title: string; url: string }>): string {
  return files.length ? JSON.stringify(files.map((f) => ({ title: f.title, url: f.url }))) : ''
}

/** `[Checklist name: item (done), item]`; several checklists are written one bracket each, joined by `,`. */
export function checklistsCell(lists: Array<{ name: string; items: Array<{ content: string; done: boolean }> }>): string {
  return lists
    .filter((l) => l.items.length)
    .map((l) => `[${l.name}: ${l.items.map((i) => (i.done ? `${i.content} (done)` : i.content)).join(', ')}]`)
    .join(',')
}

/** `[author: text (ISO date)]`, every comment inside one bracket, joined by `, `. */
export function commentsCell(comments: Array<{ author: string; body: string; createdAt: Date | string }>): string {
  if (!comments.length) return ''
  const iso = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString()
  return `[${comments.map((c) => `${c.author}: ${c.body} (${iso(c.createdAt)})`).join(', ')}]`
}

export function priorityWord(priority: Priority | null | undefined): string {
  return priority ?? ''
}

const FORMULA_LEAD = /^[=+\-@\t\r]/
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/

/** One CSV cell: formula-safe, quoted only when RFC 4180 requires it. Newlines inside a cell are kept. */
export function exportCell(value: unknown): string {
  if (value == null) return ''
  let text = value instanceof Date ? value.toISOString() : String(value)
  if (FORMULA_LEAD.test(text) && !PLAIN_NUMBER.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) || /^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** UTF-8 BOM so Excel reads the file as UTF-8. */
export const UTF8_BOM = '﻿'

export function exportCsv(headers: readonly string[], rows: unknown[][]): string {
  const lines = [headers.map(exportCell).join(','), ...rows.map((r) => r.map(exportCell).join(','))]
  return UTF8_BOM + lines.join('\r\n') + '\r\n'
}
