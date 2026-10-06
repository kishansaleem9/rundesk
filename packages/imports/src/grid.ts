/**
 * The review grid's model (§2.3), shared by the wizard and the API.
 *
 * The wizard builds it, the person edits it, and the API rebuilds the same
 * verdicts from the rows it is sent — the browser's colours are a preview of
 * the server's decision, never a substitute for it.
 *
 * Cell colours: a `format` issue (yellow) means that CELL will not import; an
 * `invalid` issue (red) means the ROW will not import. `info` is a note.
 */

import type { AutoMapTarget } from './automap'
import { TASK_COLUMNS, MAX_TASK_NAME, type ColumnKind, type TaskColumnKey } from './columns'
import { parseCustomCell, type CustomCellValue, type ImportableFieldType } from './custom-fields'
import { parseImportDate, type DateFormatKey } from './dates'
import { buildHierarchy, type Hierarchy } from './hierarchy'
import { parseDuration, parsePriority, splitMulti, type Priority } from './values'
import type { SheetTable } from './table'

export type GridColumn = {
  /** A task column key, `cf:<fieldId>` (existing field) or `new:<header>` (field created by the import). */
  key: string
  label: string
  required: boolean
  kind: ColumnKind | 'custom'
  fieldType?: ImportableFieldType
}

export type GridRow = {
  /** Stable across edits, sorting and deletion. */
  key: string
  /** The file row it came from; absent for rows typed in with "Manually enter data". */
  line?: number
  values: Record<string, string>
}

export type CellIssue = { column: string; severity: 'format' | 'invalid' | 'info'; message: string }

export type ValueMaps = {
  /** raw cell (lower-case, trimmed) → destination status name. */
  status?: Record<string, string>
  priority?: Record<string, Priority>
  /** raw cell (lower-case, trimmed) → destination task type name. */
  taskType?: Record<string, string>
}

export type GridContext = {
  dateFormat: DateFormatKey
  delimiter: string
  valueMaps?: ValueMaps
}

export const rowLabel = (row: GridRow, index?: number) =>
  row.line !== undefined ? `row ${row.line}` : `new row ${index !== undefined ? index + 1 : ''}`.trim()

export function taskGridColumns(): GridColumn[] {
  return TASK_COLUMNS.map((c) => ({ key: c.key, label: c.label, required: c.required, kind: c.kind }))
}

/** File + Map fields choices → grid. Parent ID columns are folded into the parents' `Subtask IDs`. */
export function buildGrid(
  table: SheetTable,
  mapping: Record<string, AutoMapTarget>,
  opts: {
    delimiter: string
    customFields?: Array<{ id: string; name: string; type: ImportableFieldType }>
    newFieldTypes?: Record<string, ImportableFieldType>
  },
): { columns: GridColumn[]; rows: GridRow[] } {
  const columns = taskGridColumns()
  const fields = new Map((opts.customFields ?? []).map((f) => [f.id, f]))
  const keyOf: Record<string, string> = {}
  let parentHeader: string | undefined
  for (const header of table.headers) {
    const target = mapping[header]
    if (!target || target === 'skip') continue
    if (target === 'parentId') {
      parentHeader = header
      continue
    }
    if (target === 'cf:new') {
      const key = `new:${header}`
      keyOf[header] = key
      columns.push({ key, label: header, required: false, kind: 'custom', fieldType: opts.newFieldTypes?.[header] ?? 'text' })
      continue
    }
    if (target.startsWith('cf:')) {
      const field = fields.get(target.slice(3))
      if (!field) continue
      keyOf[header] = target
      columns.push({ key: target, label: field.name, required: false, kind: 'custom', fieldType: field.type })
      continue
    }
    keyOf[header] = target
  }

  const rows: GridRow[] = table.rows.map((r) => {
    const values: Record<string, string> = {}
    table.headers.forEach((h, i) => {
      const key = keyOf[h]
      if (key) values[key] = r.cells[i] ?? ''
    })
    return { key: `r${r.line}`, line: r.line, values }
  })

  if (parentHeader) {
    const index = table.headers.indexOf(parentHeader)
    const byId = new Map<string, GridRow>()
    for (const row of rows) {
      const id = row.values.taskId?.trim()
      if (id && !byId.has(id)) byId.set(id, row)
    }
    table.rows.forEach((r, i) => {
      const parentId = (r.cells[index] ?? '').trim()
      if (!parentId) return
      const child = rows[i]
      if (!child.values.taskId?.trim()) child.values.taskId = `#${r.line}`
      const parent = byId.get(parentId)
      // A parent that is not in the file is left for the validator to name on
      // the child: the link is written onto a parent row only when one exists.
      if (!parent) return
      const ids = splitMulti(parent.values.subtaskIds ?? '', opts.delimiter)
      if (!ids.includes(child.values.taskId)) ids.push(child.values.taskId)
      parent.values.subtaskIds = ids.join(opts.delimiter)
    })
  }
  return { columns, rows }
}

const lc = (s: string) => s.trim().toLowerCase()

function priorityOf(raw: string, maps?: ValueMaps): ReturnType<typeof parsePriority> {
  const mapped = maps?.priority?.[lc(raw)]
  return mapped ? { ok: true, value: mapped } : parsePriority(raw)
}

function cellIssues(row: GridRow, columns: GridColumn[], ctx: GridContext): CellIssue[] {
  const issues: CellIssue[] = []
  for (const col of columns) {
    const raw = row.values[col.key] ?? ''
    if (col.key === 'taskName') {
      const name = raw.trim()
      if (!name) issues.push({ column: col.key, severity: 'invalid', message: 'Task Name is required.' })
      else if (name.length > MAX_TASK_NAME) {
        issues.push({ column: col.key, severity: 'invalid', message: `Task Name is ${name.length} characters; the limit is ${MAX_TASK_NAME}.` })
      }
      continue
    }
    if (!raw.trim()) continue
    let message: string | undefined
    switch (col.kind) {
      case 'date': {
        const d = parseImportDate(raw, ctx.dateFormat)
        if (!d.ok) message = d.message
        break
      }
      case 'duration': {
        const d = parseDuration(raw)
        if (!d.ok) message = d.message
        break
      }
      case 'priority': {
        const p = priorityOf(raw, ctx.valueMaps)
        if (!p.ok) message = p.message
        break
      }
      case 'custom': {
        const p = parseCustomCell(col.fieldType ?? 'text', raw, ctx)
        if (!p.ok) message = p.message
        break
      }
      default:
        break
    }
    if (message) issues.push({ column: col.key, severity: 'format', message })
  }
  return issues
}

export type GridVerdict = {
  issues: Map<string, CellIssue[]>
  hierarchy: Hierarchy
  validKeys: Set<string>
}

/** Every cell and every row, judged together (the hierarchy needs the whole sheet). */
export function validateGrid(rows: GridRow[], columns: GridColumn[], ctx: GridContext): GridVerdict {
  const issues = new Map<string, CellIssue[]>()
  rows.forEach((row) => issues.set(row.key, cellIssues(row, columns, ctx)))
  const hierarchy = buildHierarchy(
    rows.map((row, i) => ({
      key: row.key,
      label: rowLabel(row, i),
      taskId: row.values.taskId,
      subtaskIds: splitMulti(row.values.subtaskIds ?? '', ctx.delimiter),
    })),
  )
  for (const h of hierarchy.issues) issues.get(h.key)?.push({ column: h.column, severity: h.severity, message: h.message })
  const validKeys = new Set(rows.filter((r) => !issues.get(r.key)?.some((i) => i.severity === 'invalid')).map((r) => r.key))
  return { issues, hierarchy, validKeys }
}

export type ChecklistDraft = { name: string; items: Array<{ content: string; done: boolean }> }

/**
 * One checklist named "Checklist" per task (§2.3). ClickUp's export writes
 * `[Checklist name: item (done), item]`; its name and done marks are kept.
 */
export function parseChecklistCell(raw: string, delimiter: string): ChecklistDraft | null {
  const parts = splitMulti(raw, delimiter)
  if (!parts.length) return null
  let name = 'Checklist'
  const bracketed = raw.trim().startsWith('[')
  const colon = parts[0].indexOf(': ')
  if (bracketed && colon > 0) {
    name = parts[0].slice(0, colon).trim() || name
    parts[0] = parts[0].slice(colon + 2)
  }
  const items = parts
    .map((p) => {
      const done = /\s*\(done\)$/i.test(p)
      return { content: p.replace(/\s*\(done\)$/i, '').trim(), done }
    })
    .filter((i) => i.content)
  return items.length ? { name, items } : null
}

export type TaskDraft = {
  key: string
  line?: number
  name: string
  description?: string
  assignees: string[]
  status?: string
  dueDate?: number
  startDate?: number
  dateCreated?: number
  priority?: Priority
  tags: string[]
  timeEstimateMs?: number
  timeTrackedMs?: number
  subtaskNames: string[]
  checklist?: ChecklistDraft
  taskType?: string
  list?: string
  /** grid column key (`cf:<id>` / `new:<header>`) → parsed value. */
  custom: Record<string, CustomCellValue>
}

/** A valid row → what the writer creates. Cells with a `format` issue are left out, as the grid promised. */
export function rowDraft(row: GridRow, columns: GridColumn[], ctx: GridContext, issues: CellIssue[] = []): TaskDraft {
  const dropped = new Set(issues.filter((i) => i.severity === 'format').map((i) => i.column))
  const get = (key: TaskColumnKey | string) => (dropped.has(key) ? '' : (row.values[key] ?? '').trim())
  const date = (key: TaskColumnKey) => {
    const v = get(key)
    if (!v) return undefined
    const d = parseImportDate(v, ctx.dateFormat)
    return d.ok ? d.ms : undefined
  }
  const duration = (key: TaskColumnKey) => {
    const v = get(key)
    if (!v) return undefined
    const d = parseDuration(v)
    return d.ok ? d.value : undefined
  }
  const statusRaw = get('status')
  const typeRaw = get('taskType')
  const priorityRaw = get('priority')
  const priority = priorityRaw ? priorityOf(priorityRaw, ctx.valueMaps) : undefined
  const custom: Record<string, CustomCellValue> = {}
  for (const col of columns) {
    if (col.kind !== 'custom') continue
    const v = dropped.has(col.key) ? '' : (row.values[col.key] ?? '')
    if (!v.trim()) continue
    const p = parseCustomCell(col.fieldType ?? 'text', v, ctx)
    if (p.ok) custom[col.key] = p.value
  }
  return {
    key: row.key,
    line: row.line,
    name: get('taskName'),
    description: (dropped.has('description') ? '' : row.values.description ?? '').trim() || undefined,
    assignees: splitMulti(get('assignees'), ctx.delimiter),
    status: statusRaw ? (ctx.valueMaps?.status?.[lc(statusRaw)] ?? statusRaw) : undefined,
    dueDate: date('dueDate'),
    startDate: date('startDate'),
    dateCreated: date('dateCreated'),
    priority: priority?.ok ? priority.value : undefined,
    tags: [...new Set(splitMulti(get('tags'), ctx.delimiter))],
    timeEstimateMs: duration('timeEstimate'),
    timeTrackedMs: duration('timeTracked'),
    subtaskNames: splitMulti(get('subtaskNames'), ctx.delimiter),
    checklist: parseChecklistCell(get('checklist'), ctx.delimiter) ?? undefined,
    taskType: typeRaw ? (ctx.valueMaps?.taskType?.[lc(typeRaw)] ?? typeRaw) : undefined,
    list: get('list') || undefined,
    custom,
  }
}
