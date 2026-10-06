/**
 * §2.3 — the spreadsheet importer's target columns, in the exact order the
 * grid draws them. ONE list: the Map fields step, the grid, the validator and
 * the writer all read it, so a column cannot exist in one place and not another.
 */

export type TaskColumnKey =
  | 'taskName'
  | 'taskId'
  | 'subtaskIds'
  | 'description'
  | 'assignees'
  | 'status'
  | 'dueDate'
  | 'startDate'
  | 'dateCreated'
  | 'priority'
  | 'tags'
  | 'timeEstimate'
  | 'timeTracked'
  | 'subtaskNames'
  | 'checklist'
  | 'taskType'
  | 'list'

export type ColumnKind = 'text' | 'id' | 'idList' | 'people' | 'status' | 'date' | 'priority' | 'list' | 'duration' | 'taskType'

export type TaskColumn = {
  key: TaskColumnKey
  /** The header exactly as §2.3 spells it. */
  label: string
  required: boolean
  kind: ColumnKind
  /** Split on the chosen multi-value delimiter (§2.2's helper text names these). */
  multi: boolean
}

export const TASK_COLUMNS: readonly TaskColumn[] = [
  { key: 'taskName', label: 'Task Name', required: true, kind: 'text', multi: false },
  { key: 'taskId', label: 'Task ID', required: false, kind: 'id', multi: false },
  { key: 'subtaskIds', label: 'Subtask IDs', required: false, kind: 'idList', multi: true },
  { key: 'description', label: 'Description content', required: false, kind: 'text', multi: false },
  { key: 'assignees', label: 'Task assignee', required: false, kind: 'people', multi: true },
  { key: 'status', label: 'Status', required: false, kind: 'status', multi: false },
  { key: 'dueDate', label: 'Due Date', required: false, kind: 'date', multi: false },
  { key: 'startDate', label: 'Start Date', required: false, kind: 'date', multi: false },
  { key: 'dateCreated', label: 'Date Created', required: false, kind: 'date', multi: false },
  { key: 'priority', label: 'Priority', required: false, kind: 'priority', multi: false },
  { key: 'tags', label: 'Tags', required: false, kind: 'list', multi: true },
  { key: 'timeEstimate', label: 'Time Estimate', required: false, kind: 'duration', multi: false },
  { key: 'timeTracked', label: 'Time Tracked', required: false, kind: 'duration', multi: false },
  { key: 'subtaskNames', label: 'Subtask Names', required: false, kind: 'list', multi: true },
  { key: 'checklist', label: 'Checklist', required: false, kind: 'list', multi: true },
  { key: 'taskType', label: 'Task Type', required: false, kind: 'taskType', multi: false },
  { key: 'list', label: 'List', required: false, kind: 'text', multi: false },
] as const

export const columnByKey = (key: string): TaskColumn | undefined => TASK_COLUMNS.find((c) => c.key === key)

/**
 * What an incoming header is mapped to:
 *  - a task column key,
 *  - `cf:<fieldId>` — an existing Custom Field in the destination,
 *  - `cf:new` — "Add as new custom field" (its type is chosen on the Custom Fields screen),
 *  - `skip` — "Incoming fields not mapped to a RUNDESK field will be excluded."
 */
export type MappingTarget = TaskColumnKey | `cf:${string}` | 'skip'

/** incoming header → target. */
export type ColumnMapping = Record<string, MappingTarget>

export const MAX_TASK_NAME = 500

/** The name §2.2 gives the List an import creates when a Space or Folder is the destination. */
export const IMPORTED_LIST_NAME = 'Imported from Spreadsheet'

/** §2.2 "CHOOSE THE DELIMITER FOR MULTI-VALUE FIELDS." — exact option labels. */
export const DELIMITER_OPTIONS = [
  { value: ',', label: 'Comma(,)' },
  { value: '|', label: 'Pipe(|)' },
  { value: ';', label: 'Semicolon(;)' },
  { value: 'other', label: 'Other' },
] as const

/** A mapping's blocking problem, in the words the Map fields step shows, or null. */
export function mappingProblem(mapping: ColumnMapping): string | null {
  const names = Object.values(mapping).filter((t) => t === 'taskName').length
  if (names === 0) return 'Task Name is required. Map one incoming field to Task Name.'
  if (names > 1) return 'Only one incoming field can be mapped to Task Name.'
  const seen = new Set<string>()
  for (const t of Object.values(mapping)) {
    if (t === 'skip' || t === 'cf:new') continue
    if (seen.has(t)) return `More than one incoming field is mapped to ${columnByKey(t)?.label ?? 'the same field'}.`
    seen.add(t)
  }
  return null
}
