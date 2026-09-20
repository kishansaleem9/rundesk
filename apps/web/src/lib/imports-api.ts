/**
 * §V2-S13 frame `12:08` — the client for the generic spreadsheet importer.
 *
 * The preset catalogue is FETCHED, never hardcoded here. The frame's ten named
 * tools are only honest if the picker can draw exactly the ones the parser has
 * a mapping for; a second copy of the list in the web app is how a picker ends
 * up offering ten of nineteen options and nobody notices.
 */
import { api } from './api'

export type SheetField =
  | 'title'
  | 'description'
  | 'status'
  | 'priority'
  | 'dueDate'
  | 'startDate'
  | 'assignees'
  | 'list'
  | 'tags'
  | 'ignore'

/** The order the mapper draws the options in. Mirrors `SHEET_FIELDS`. */
export const SHEET_FIELDS: SheetField[] = [
  'title',
  'description',
  'status',
  'priority',
  'dueDate',
  'startDate',
  'assignees',
  'list',
  'tags',
  'ignore',
]

export type ColumnMapping = Record<string, SheetField>

export type SheetSourceCatalogue = {
  sources: Array<{ key: string; label: string; exportHint: string; columns: number }>
  /** Named on the frame, deliberately NOT drawn as a control, and why. */
  unsupported: Array<{ key: string; label: string; reason: string }>
  acceptedExtensions: string[]
}

export type RowRejection = {
  row: number
  code: string
  message: string
  column?: string
  value?: string
}

export type SheetPreview = {
  preset: string
  presetLabel: string
  delimiter: string
  headers: string[]
  mapping: ColumnMapping
  mappingError: string | null
  totalRows: number
  importableRows: number
  rejectedRows: number
  rowErrors: RowRejection[]
  uniqueLists: string[]
  duplicates: number
  sample: Array<{
    row: number
    title: string
    status: string
    priority: string
    list: string
    dueDate: string | null
    assignees: string[]
    tags: string[]
  }>
}

export type SheetSummary = {
  source: string
  sourcePreset: string
  spacesCreated: number
  projectsCreated: number
  listsCreated: number
  tasksCreated: number
  tasksUpdated: number
  tasksSkipped: number
  tasksRejected: number
  labelsCreated: number
  assigneesLinked: number
  assigneesUnmatched: number
  duplicatesDetected: number
  rowErrors: RowRejection[]
  rowErrorsTruncated: boolean
  errors: string[]
}

export type SheetJob = {
  id: string
  source: string
  sourcePreset: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total: number
  processed: number
  createdCount: number
  updatedCount: number
  skippedCount: number
  rejectedCount: number
  error: string | null
  result: SheetSummary | null
  createdAt?: string
}

const root = (workspaceId: string) => `/workspaces/${workspaceId}/import/spreadsheet`

export const fetchSheetSources = (workspaceId: string) =>
  api<SheetSourceCatalogue>(`${root(workspaceId)}/sources`)

export const previewSheet = (
  workspaceId: string,
  body: { content: string; preset?: string; mapping?: ColumnMapping; delimiter?: string; defaultListName?: string },
) => api<SheetPreview>(`${root(workspaceId)}/preview`, { method: 'POST', body })

export const startSheetImport = (
  workspaceId: string,
  body: {
    content: string
    preset?: string
    mapping?: ColumnMapping
    delimiter?: string
    targetProjectName?: string
    defaultListName?: string
    strategy?: 'skip' | 'create' | 'merge'
  },
) => api<{ jobId: string }>(root(workspaceId), { method: 'POST', body })

export const fetchSheetJob = (workspaceId: string, jobId: string) =>
  api<SheetJob>(`${root(workspaceId)}/jobs/${jobId}`)

/**
 * The import history. `source` goes out as a query parameter and the server
 * filters the job table on it — the reader that keeps `clickup_import_jobs.source`
 * from being a value nothing honours.
 */
export const fetchSheetJobs = (workspaceId: string, source = 'spreadsheet') =>
  api<SheetJob[]>(`${root(workspaceId)}/jobs?source=${encodeURIComponent(source)}`)
