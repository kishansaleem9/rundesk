/**
 * The spreadsheet source → `RundeskImportBundle` (§9.2). Pure: it takes the
 * reviewed grid exactly as the wizard sent it, judges it again (the API never
 * trusts the browser's verdict), and turns the valid rows into bundle records.
 */

import { emptyBundle, type BundleTask, type RundeskImportBundle } from './bundle'
import { rowDraft, rowLabel, validateGrid, type GridColumn, type GridContext, type GridRow } from './grid'

export type SpreadsheetReport = {
  /** Rows not imported, with every reason. */
  skipped: Array<{ ref: string; reasons: string[] }>
  /** Cells left out and notes (flattened subtasks, orphaned subtasks) — the rows themselves were imported. */
  warnings: Array<{ ref: string; column?: string; message: string }>
}

export const listSourceId = (name: string) => `list:${name.trim().toLowerCase()}`

export function spreadsheetBundle(
  rows: GridRow[],
  columns: GridColumn[],
  ctx: GridContext,
): { bundle: RundeskImportBundle; report: SpreadsheetReport } {
  const verdict = validateGrid(rows, columns, ctx)
  const bundle = emptyBundle()
  const report: SpreadsheetReport = { skipped: [], warnings: [] }
  const labelOf = new Map(rows.map((r, i) => [r.key, rowLabel(r, i)]))

  const lists = new Map<string, string>()
  const statuses = new Map<string, string>()
  const types = new Map<string, string>()
  const tags = new Map<string, string>()
  const fieldValues = new Map<string, Set<string>>()
  const tasks = new Map<string, BundleTask>()

  rows.forEach((row) => {
    const ref = labelOf.get(row.key)!
    const issues = verdict.issues.get(row.key) ?? []
    if (!verdict.validKeys.has(row.key)) {
      report.skipped.push({ ref, reasons: issues.filter((i) => i.severity === 'invalid').map((i) => i.message) })
      return
    }
    for (const i of issues) {
      if (i.severity === 'format') report.warnings.push({ ref, column: i.column, message: `${i.message} This cell was not imported.` })
      if (i.severity === 'info') report.warnings.push({ ref, column: i.column, message: i.message })
    }
    const d = rowDraft(row, columns, ctx, issues)
    if (d.list) lists.set(listSourceId(d.list), d.list)
    if (d.status) statuses.set(d.status.toLowerCase(), d.status)
    if (d.taskType) types.set(d.taskType.toLowerCase(), d.taskType)
    for (const t of d.tags) tags.set(t.toLowerCase(), t)
    for (const [key, value] of Object.entries(d.custom)) {
      const seen = fieldValues.get(key) ?? new Set<string>()
      for (const v of Array.isArray(value) ? value : [value]) if (typeof v === 'string') seen.add(v)
      fieldValues.set(key, seen)
    }
    tasks.set(row.key, {
      sourceId: row.key,
      sourceRef: ref,
      listSourceId: d.list ? listSourceId(d.list) : undefined,
      name: d.name,
      description: d.description,
      statusName: d.status,
      priority: d.priority,
      dueDate: d.dueDate,
      startDate: d.startDate,
      dateCreated: d.dateCreated,
      timeEstimateMs: d.timeEstimateMs,
      taskTypeName: d.taskType,
      tags: d.tags,
      assignees: d.assignees,
      fields: d.custom,
      comments: [],
      attachments: [],
      checklists: d.checklist ? [d.checklist] : [],
      timeEntries: d.timeTrackedMs ? [{ durationMs: d.timeTrackedMs }] : [],
      relationships: [],
      subtaskNames: d.subtaskNames,
    })
  })

  // Parents are linked only to rows that are themselves imported; a subtask
  // whose parent row was skipped is imported as a task and the report says so.
  for (const [child, parent] of verdict.hierarchy.parentOf) {
    const task = tasks.get(child)
    if (!task) continue
    if (tasks.has(parent)) {
      task.parentSourceId = parent
      // A subtask lives in its parent's List.
      task.listSourceId = tasks.get(parent)!.listSourceId
    } else {
      report.warnings.push({
        ref: labelOf.get(child)!,
        column: 'subtaskIds',
        message: `Its parent (${labelOf.get(parent)}) was not imported, so this row was imported as a task.`,
      })
    }
  }

  bundle.lists = [...lists].map(([sourceId, name]) => ({ sourceId, name }))
  bundle.statuses = [...statuses.values()].map((name) => ({ sourceId: `status:${name.toLowerCase()}`, name }))
  bundle.taskTypes = [...types.values()].map((name) => ({ sourceId: `type:${name.toLowerCase()}`, name }))
  bundle.tags = [...tags.values()].map((name) => ({ sourceId: `tag:${name.toLowerCase()}`, name }))
  bundle.customFields = columns
    .filter((c) => c.kind === 'custom')
    .map((c) => ({
      sourceId: c.key,
      name: c.label,
      type: c.fieldType ?? 'text',
      existingFieldId: c.key.startsWith('cf:') ? c.key.slice(3) : undefined,
      options: c.fieldType === 'dropdown' || c.fieldType === 'labels' ? [...(fieldValues.get(c.key) ?? [])] : undefined,
    }))
  // Parents before children, so the writer never waits on a row it has not written.
  const ordered = [...tasks.values()]
  bundle.tasks = [...ordered.filter((t) => !t.parentSourceId), ...ordered.filter((t) => t.parentSourceId)]
  return { bundle, report }
}
