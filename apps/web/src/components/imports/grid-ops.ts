/**
 * The review grid's edits (§2.3), as pure functions over rows so they are
 * tested without a DOM: the column header menu (sort, find and replace,
 * replace empty cells, clear column), row deletion, and the All / Valid /
 * Invalid / search / filter-by-value view.
 */

import type { CellIssue, GridColumn, GridRow } from '@rundesk/imports'

export type ViewFilter = 'all' | 'valid' | 'invalid'

export function sortRows(rows: GridRow[], column: string, direction: 'asc' | 'desc'): GridRow[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => sign * (a.values[column] ?? '').localeCompare(b.values[column] ?? '', 'en-GB', { numeric: true, sensitivity: 'base' }))
}

export function findAndReplace(rows: GridRow[], column: string, find: string, replace: string): { rows: GridRow[]; changed: number } {
  if (!find) return { rows, changed: 0 }
  let changed = 0
  const out = rows.map((r) => {
    const v = r.values[column] ?? ''
    if (!v.includes(find)) return r
    changed++
    return { ...r, values: { ...r.values, [column]: v.split(find).join(replace) } }
  })
  return { rows: out, changed }
}

export function replaceEmpty(rows: GridRow[], column: string, value: string): { rows: GridRow[]; changed: number } {
  let changed = 0
  const out = rows.map((r) => {
    if ((r.values[column] ?? '').trim() !== '') return r
    changed++
    return { ...r, values: { ...r.values, [column]: value } }
  })
  return { rows: out, changed }
}

export function clearColumn(rows: GridRow[], column: string): GridRow[] {
  return rows.map((r) => ((r.values[column] ?? '') === '' ? r : { ...r, values: { ...r.values, [column]: '' } }))
}

export function setCell(rows: GridRow[], key: string, column: string, value: string): GridRow[] {
  return rows.map((r) => (r.key === key ? { ...r, values: { ...r.values, [column]: value } } : r))
}

export function deleteRows(rows: GridRow[], keys: ReadonlySet<string>): GridRow[] {
  return rows.filter((r) => !keys.has(r.key))
}

/** "Manually enter data" — an empty row with a key no file row can have. */
export function blankRow(existing: GridRow[]): GridRow {
  let n = existing.length + 1
  const taken = new Set(existing.map((r) => r.key))
  while (taken.has(`m${n}`)) n++
  return { key: `m${n}`, values: {} }
}

export type RowView = {
  filter: ViewFilter
  search: string
  /** "Search in field" / "Filter by value": one column, one value. */
  field?: { column: string; value: string; exact: boolean }
}

/**
 * "Valid" is a row with nothing to fix; "Invalid", one with a red cell (the
 * row will not import) or a yellow one (that cell will not). The import
 * button counts what WILL import — rows with no red cell — which is wider.
 */
export function visibleRows(rows: GridRow[], issues: Map<string, CellIssue[]>, view: RowView): GridRow[] {
  const q = view.search.trim().toLowerCase()
  const flawed = (key: string) => (issues.get(key) ?? []).some((i) => i.severity !== 'info')
  return rows.filter((r) => {
    if (view.filter === 'valid' && flawed(r.key)) return false
    if (view.filter === 'invalid' && !flawed(r.key)) return false
    if (q && !Object.values(r.values).some((v) => v.toLowerCase().includes(q))) return false
    if (view.field) {
      const v = (r.values[view.field.column] ?? '').toLowerCase()
      const want = view.field.value.toLowerCase()
      if (view.field.exact ? v !== want : !v.includes(want)) return false
    }
    return true
  })
}

/** The distinct values of a column, most common first — "Filter by value" offers these. */
export function distinctValues(rows: GridRow[], column: string, limit = 50): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const v = (r.values[column] ?? '').trim()
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, limit)
}

/** "Download" in Actions: the selected rows (or all) as CSV, in the grid's columns. */
export function rowsToCsv(rows: GridRow[], columns: GridColumn[]): string {
  const cell = (v: string) => {
    let text = v
    if (/^[=+\-@\t\r]/.test(text) && !/^[+-]?\d+(\.\d+)?$/.test(text)) text = `'${text}`
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const lines = [columns.map((c) => cell(c.label)).join(','), ...rows.map((r) => columns.map((c) => cell(r.values[c.key] ?? '')).join(','))]
  return '﻿' + lines.join('\r\n') + '\r\n'
}
