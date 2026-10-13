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
  /** What the file was read as; a workbook's sheet that was read. */
  format: 'csv' | 'xlsx' | 'xls' | 'json'
  sheetName: string | null
  /** A source's export read in its own layout: Monday's board and its groups, Wrike's lines repeating a task. */
  layout: { kind: 'board'; board: string; groups: string[]; leftOut: number } | { kind: 'keyed'; repeated: number } | null
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
  body: { content?: string; fileKey?: string; fileName?: string; preset?: string; mapping?: ColumnMapping; delimiter?: string; defaultListName?: string },
) => api<SheetPreview>(`${root(workspaceId)}/preview`, { method: 'POST', body })

export const startSheetImport = (
  workspaceId: string,
  body: {
    content?: string
    fileKey?: string
    fileName?: string
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

// ── files uploaded to import (`commit-log/log-601eacc-2`) ─────────────────────

export type ImportPurpose = 'sheet' | 'doc' | 'confluence' | 'slack'

/**
 * A file to import, put in the store first and named by its key: a workbook,
 * a Word document, a Confluence or Slack export. None of them survives being
 * read as text into a JSON body (`import-files.ts` on the server). The type
 * the address was signed for is the type the file is sent as.
 */
export async function uploadImportFile(workspaceId: string, file: File, purpose: ImportPurpose): Promise<string> {
  const contentType = file.type || 'application/octet-stream'
  const presign = await api<{ uploadUrl: string; fileKey: string; maxBytes: number }>(
    `/workspaces/${workspaceId}/import/files`,
    { method: 'POST', body: { fileName: file.name, contentType, sizeBytes: file.size, purpose } },
  )
  const put = await fetch(presign.uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': contentType } })
  if (!put.ok) throw new Error(`The file could not be uploaded (${put.status})`)
  return presign.fileKey
}

// ── Slack ──────────────────────────────────────────────────────────────────────

export type SlackPreview = {
  channels: Array<{ name: string; archived: boolean; messages: number; replies: number; pastTheLimit: number }>
  people: { total: number; members: number }
  notImported: { privateChannels: number; directMessages: number }
}

export type SlackSummary = {
  channelsCreated: number
  messagesImported: number
  repliesImported: number
  reactionsImported: number
  peopleMatched: number
  authorsNotMembers: string[]
  reactionsSkipped: number
  messagesPastTheLimit: number
  notImported: { privateChannels: number; directMessages: number }
  channels: Array<{ id: string; name: string; slackName: string; messages: number }>
}

export const previewSlack = (workspaceId: string, fileKey: string) =>
  api<SlackPreview>(`/workspaces/${workspaceId}/import/slack/preview`, { method: 'POST', body: { fileKey } })

export const startSlackImport = (workspaceId: string, body: { fileKey: string; channels: string[]; spaceId?: string | null }) =>
  api<{ jobId: string }>(`/workspaces/${workspaceId}/import/slack`, { method: 'POST', body })

// ── Basecamp ───────────────────────────────────────────────────────────────────

export type BasecampStatus = {
  configured: boolean
  missing: string[]
  connected: boolean
  name: string | null
  accounts: Array<{ id: string; name: string }>
}

export type BasecampProject = { id: string; name: string; description: string; kind: 'project' | 'team' | 'hq'; hasTodos: boolean }

export type BasecampSummary = {
  spacesCreated: number
  foldersCreated: number
  listsCreated: number
  tasksCreated: number
  tasksDone: number
  statusesFromGroups: number
  assigneesLinked: number
  assigneesUnmatched: number
  commentsImported: number
  projects: Array<{ name: string; lists: number; tasks: number }>
  errors: string[]
}

const basecamp = (workspaceId: string) => `/workspaces/${workspaceId}/import/basecamp`

export const fetchBasecampStatus = (workspaceId: string) => api<BasecampStatus>(basecamp(workspaceId))
export const connectBasecamp = (workspaceId: string) => api<{ authUrl: string }>(`${basecamp(workspaceId)}/connect`, { method: 'POST' })
export const disconnectBasecamp = (workspaceId: string) => api<{ connected: false }>(basecamp(workspaceId), { method: 'DELETE' })
export const fetchBasecampProjects = (workspaceId: string, accountId: string) =>
  api<BasecampProject[]>(`${basecamp(workspaceId)}/projects?account=${encodeURIComponent(accountId)}`)
export const startBasecampImport = (workspaceId: string, body: { accountId: string; projectIds: string[]; spaceId?: string | null }) =>
  api<{ jobId: string }>(basecamp(workspaceId), { method: 'POST', body })

// ── Confluence and Word/HTML documents ────────────────────────────────────────

export type ConfluenceResult = { doc: { id: string; title: string }; pagesImported: number; missing: string[]; limit: number | null }

export const importConfluence = (workspaceId: string, body: { fileKey: string; spaceId?: string | null }) =>
  api<ConfluenceResult>(`/workspaces/${workspaceId}/docs/import/confluence`, { method: 'POST', body })

/** An import job of any importer, read on the one job route every importer's job is followed on. */
export const fetchImportJob = <R>(workspaceId: string, jobId: string) =>
  api<Omit<SheetJob, 'result'> & { result: R | null }>(`${root(workspaceId)}/jobs/${jobId}`)
