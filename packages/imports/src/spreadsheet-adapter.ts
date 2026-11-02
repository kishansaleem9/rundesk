/**
 * The spreadsheet source → `RundeskImportBundle` (§9.2). Pure: it takes the
 * reviewed grid exactly as the wizard sent it, judges it again (the API never
 * trusts the browser's verdict), and turns the valid rows into bundle records.
 */

import { emptyBundle, type BundleFolder, type BundleList, type BundleSpace, type BundleTask, type RundeskImportBundle } from './bundle'
import { rowDraft, rowLabel, validateGrid, type GridColumn, type GridContext, type GridRow, type TaskDraft } from './grid'

export type SpreadsheetReport = {
  /** Rows not imported, with every reason. */
  skipped: Array<{ ref: string; reasons: string[] }>
  /** Cells left out and notes (flattened subtasks, orphaned subtasks) — the rows themselves were imported. */
  warnings: Array<{ ref: string; column?: string; message: string }>
}

export const listSourceId = (name: string) => `list:${name.trim().toLowerCase()}`

const pathKey = (parts: string[]) => parts.map((p) => p.trim().toLowerCase()).join(' > ')

/**
 * The Spaces, Folders and Lists the rows name. A `List location` of
 * `Space > Folder > List` names all three (`Space > List`, a List straight in
 * its Space), each keyed by its whole path, so two Lists of one name in
 * different Folders stay two. Without one, the `List` cell names a List alone,
 * as it always has.
 */
class Places {
  readonly spaces = new Map<string, BundleSpace>()
  readonly folders = new Map<string, BundleFolder>()
  readonly lists = new Map<string, BundleList>()

  listOf(d: TaskDraft): string | undefined {
    const parts = d.location
    if (parts && parts.length > 1) {
      const [space, ...rest] = parts
      const spaceSourceId = `space:${pathKey([space])}`
      if (!this.spaces.has(spaceSourceId)) this.spaces.set(spaceSourceId, { sourceId: spaceSourceId, name: space })
      const folderParts = rest.slice(0, -1)
      let folderSourceId: string | undefined
      if (folderParts.length) {
        folderSourceId = `folder:${pathKey([space, ...folderParts])}`
        if (!this.folders.has(folderSourceId)) this.folders.set(folderSourceId, { sourceId: folderSourceId, spaceSourceId, name: folderParts.join(' / ') })
      }
      const sourceId = `list:${pathKey(parts)}`
      if (!this.lists.has(sourceId)) this.lists.set(sourceId, { sourceId, spaceSourceId, folderSourceId, name: rest[rest.length - 1] })
      return sourceId
    }
    const name = parts?.[0] ?? d.list
    if (!name) return undefined
    const sourceId = listSourceId(name)
    if (!this.lists.has(sourceId)) this.lists.set(sourceId, { sourceId, name })
    return sourceId
  }
}

export function spreadsheetBundle(
  rows: GridRow[],
  columns: GridColumn[],
  ctx: GridContext,
): { bundle: RundeskImportBundle; report: SpreadsheetReport } {
  const verdict = validateGrid(rows, columns, ctx)
  const bundle = emptyBundle()
  const report: SpreadsheetReport = { skipped: [], warnings: [] }
  const labelOf = new Map(rows.map((r, i) => [r.key, rowLabel(r, i)]))

  const places = new Places()
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
    const listSource = places.listOf(d)
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
      listSourceId: listSource,
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
      checklists: d.checklists,
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

  bundle.spaces = [...places.spaces.values()]
  bundle.folders = [...places.folders.values()]
  bundle.lists = [...places.lists.values()]
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
