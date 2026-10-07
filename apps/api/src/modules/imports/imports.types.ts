import type { DateFormatKey, GridColumn, GridRow, ValueMaps } from '@rundesk/imports'

/**
 * Where an import goes (§2.2): a Space, a Folder, a Project (RUNDESK's level
 * between a Folder and a List) or a List.
 */
export type ImportDestination = { type: 'space' | 'folder' | 'project' | 'list'; id: string }

/** What the person chose before Start — kept on the job for the report's Settings tab and for a resumed run. */
export type SpreadsheetImportOptions = {
  destination: ImportDestination
  dateFormat: DateFormatKey
  /** The multi-value delimiter itself (`,` `|` `;` or the one character typed for Other). */
  delimiter: string
  valueMaps?: ValueMaps
  /** Unmatched assignees (emails) the person chose to invite; every other unmatched name is skipped. */
  invite?: string[]
}

/** The grid as the wizard sent it: its columns, and (in staged chunks) its rows. */
export type SpreadsheetImportMapping = {
  /** Incoming header → target, as chosen on Map fields (saved to mapping memory at Start). */
  columns: Record<string, string>
  grid: GridColumn[]
}

export type StagedRow = GridRow

/** Status as stored → the label the history draws (§7). */
export const IMPORT_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending: 'Import Queued',
  processing: 'Import Pending',
  completed: 'Completed',
  failed: 'Import Failed',
  cancelled: 'Cancelled',
  deleted: 'Deleted',
}

/** Phases a run moves through, in order (§9.3, as the spreadsheet source needs them). */
export const RUN_PHASES = ['validating', 'creating_lists', 'creating_fields', 'creating_tasks', 'finalising'] as const
export type RunPhase = (typeof RUN_PHASES)[number]

/** The run's report, stored in `result` and read by View details. */
export type ImportReport = {
  source: string
  destination: { type: string; id: string; name: string; path: string }
  counts: {
    tasksCreated: number
    subtasksCreated: number
    tasksSkipped: number
    tasksFailed: number
    listsCreated: number
    projectsCreated: number
    fieldsCreated: number
    tagsCreated: number
    statusesCreated: number
    taskTypesCreated: number
    checklistsCreated: number
    timeEntriesCreated: number
  }
  users: Array<{ value: string; outcome: 'matched' | 'invited' | 'skipped'; userId?: string; name?: string; note?: string }>
  warningsCount: number
  durationMs?: number
}
