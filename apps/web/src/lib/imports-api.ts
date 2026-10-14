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

export type ImportPurpose = 'sheet' | 'doc' | 'confluence' | 'slack' | 'notion'

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

// ── Asana, Jira, Monday, Todoist, Trello, Wrike — and Notion (`found-13-oct/importers-by-sign-in-unbuilt`) ──

// ClickUp too: a whole Workspace and its people, on the ClickUp tab (`found-14-oct/clickup-workspace-import-and-people-unbuilt`).
export type AppKey = 'asana' | 'jira' | 'monday' | 'todoist' | 'trello' | 'wrike' | 'clickup'
export const APP_KEYS: AppKey[] = ['asana', 'jira', 'monday', 'todoist', 'trello', 'wrike']

export type AppOption = { key: string; choices: string[]; default: string }
export type AppStatus = {
  key: AppKey
  label: string
  auth: 'oauth' | 'trello' | 'token'
  configured: boolean
  missing: string[]
  connected: boolean
  name: string | null
  options: AppOption[]
  notImported: string[]
}
export type AppSource = { id: string; name: string }
export type AppProject = { id: string; name: string; detail?: string | null }
export type AppPeople = {
  /** `invite`: the role this person may be invited as, when they are not here and the importer may invite; else null. */
  people: Array<{ key: string; name: string | null; email: string | null; match: string | null; role?: string | null; invite?: string | null }>
  members: Array<{ id: string; name: string; email: string | null }>
  mayInvite?: boolean
}
export type AppSummary = {
  source: string
  spacesCreated: number
  foldersCreated: number
  listsCreated: number
  tasksCreated: number
  subtasksCreated: number
  subtasksFlattened: number
  tasksDone: number
  statusesCreated: number
  assigneesLinked: number
  assigneesUnmatched: number
  assigneesPending?: number
  invited?: Array<{ name: string | null; email: string; role: string }>
  tagsApplied: number
  checklistsImported: number
  fieldsCreated: number
  fieldValuesSet: number
  commentsImported: number
  attachmentsImported: number
  attachmentsSkipped: number
  linksMade: number
  projects: Array<{ name: string; lists: number; tasks: number }>
  made: { spaces: Array<{ id: string; name: string }>; folders: Array<{ id: string; name: string }>; lists: Array<{ id: string; name: string }> }
  notImported: string[]
  errors: string[]
  docs?: Array<{ id: string; title: string }>
  pagesImported?: number
}

const apps = (workspaceId: string) => `/workspaces/${workspaceId}/import/apps`

export const fetchApps = (workspaceId: string) => api<Array<Pick<AppStatus, 'key' | 'label' | 'auth' | 'configured' | 'connected' | 'name'>>>(apps(workspaceId))
export const fetchAppStatus = (workspaceId: string, app: AppKey) => api<AppStatus>(`${apps(workspaceId)}/${app}`)
export const connectApp = (workspaceId: string, app: AppKey) => api<{ authUrl: string }>(`${apps(workspaceId)}/${app}/connect`, { method: 'POST' })
export const saveAppToken = (workspaceId: string, app: AppKey, token: string) =>
  api<{ connected: true; name: string }>(`${apps(workspaceId)}/${app}/token`, { method: 'POST', body: { token } })
export const disconnectApp = (workspaceId: string, app: AppKey) => api<{ connected: false }>(`${apps(workspaceId)}/${app}`, { method: 'DELETE' })
export const fetchAppSources = (workspaceId: string, app: AppKey) => api<AppSource[]>(`${apps(workspaceId)}/${app}/sources`)
export const fetchAppProjects = (workspaceId: string, app: AppKey, source: string) =>
  api<AppProject[]>(`${apps(workspaceId)}/${app}/projects?source=${encodeURIComponent(source)}`)
export const fetchAppPeople = (workspaceId: string, app: AppKey, source: string, projects: string[]) =>
  api<AppPeople>(`${apps(workspaceId)}/${app}/people?source=${encodeURIComponent(source)}&projects=${encodeURIComponent(projects.join(','))}`)
export const startAppImport = (
  workspaceId: string,
  app: AppKey,
  body: { source: string; projectIds: string[]; spaceId: string | null; options: Record<string, string>; people: Record<string, string | null>; invite?: Record<string, string> },
) => api<{ jobId: string; invited?: number }>(`${apps(workspaceId)}/${app}`, { method: 'POST', body })
export const startNotionImport = (workspaceId: string, body: { fileKey: string; spaceId: string | null }) =>
  api<{ jobId: string }>(`/workspaces/${workspaceId}/import/notion`, { method: 'POST', body })

// ── Confluence and Word/HTML documents ────────────────────────────────────────

export type ConfluenceResult = { doc: { id: string; title: string }; pagesImported: number; missing: string[]; limit: number | null }

export const importConfluence = (workspaceId: string, body: { fileKey: string; spaceId?: string | null }) =>
  api<ConfluenceResult>(`/workspaces/${workspaceId}/docs/import/confluence`, { method: 'POST', body })

/** An import job of any importer, read on the one job route every importer's job is followed on. */
export const fetchImportJob = <R>(workspaceId: string, jobId: string) =>
  api<Omit<SheetJob, 'result'> & { result: R | null }>(`${root(workspaceId)}/jobs/${jobId}`)
