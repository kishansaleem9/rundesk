/**
 * Settings › Imports / Exports — the web's calls into the import engine
 * (`/workspaces/:id/imports`) and the export jobs (`/workspaces/:id/exports`).
 */

import type { DateFormatKey, GridColumn, GridRow, ValueMaps } from '@rundesk/imports'
import { api, downloadFile } from './api'

export type LocationType = 'space' | 'folder' | 'project' | 'list'
export type LocationRef = { type: LocationType; id: string }

export type HistoryRow = {
  kind: 'import' | 'export'
  id: string
  source: string
  /** The app whose export it was (`asana`, `jira`, …) or `generic`. */
  sourcePreset?: string | null
  status: string
  statusLabel: string
  phase: string | null
  total: number
  processed: number
  itemsImported: number
  fileName: string | null
  error: string | null
  supportReference: string
  deletable: boolean
  deletableUntil: string | null
  cancellable: boolean
  downloadable?: boolean
  startedAt: string
  finishedAt: string | null
  createdAt: string
  by: { id: string; name: string | null; avatarUrl: string | null } | null
}

export type ImportPreview = {
  destination: { type: LocationType; id: string; name: string; path: string }
  customFields: Array<{ id: string; name: string; type: string; importable: boolean }>
  statuses: Array<{ key: string; name: string; color: string; category: string }>
  taskTypes: Array<{ id: string; name: string }>
  members: Array<{ id: string; name: string; email: string; avatarUrl: string | null }>
  mappingMemory: Record<string, string>
}

export type ImportReport = HistoryRow & {
  report: {
    destination?: { name: string; path: string }
    counts?: Record<string, number>
    users?: Array<{ value: string; outcome: 'matched' | 'invited' | 'skipped'; name?: string; note?: string }>
    warningsCount?: number
    durationMs?: number
  } | null
  legacyRowErrors: Array<{ row: number; message: string }> | null
  settings: { options: Record<string, unknown> | null; mapping: Record<string, string> | null; fileName: string | null }
  items: Array<{ entityType: string; entityId: string | null; sourceRef: string | null; action: string; message: string | null; url: string | null }>
  errors: Array<{ rowRef: string | null; field: string | null; message: string; severity: 'error' | 'warning' }>
  errorCount: number
}

export type ExportState = {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  rowCount: number | null
  fileName: string | null
  error: string | null
  supportReference: string | null
  download: { url: string; expiresAt: string } | null
  expired: boolean
}

const base = (ws: string) => `/workspaces/${ws}/imports`

export const importsApi = {
  history: (ws: string) => api<{ items: HistoryRow[] }>(`${base(ws)}?limit=100`),
  create: (ws: string, body: { source: 'spreadsheet'; preset?: string; fileName?: string; options: { destination: LocationRef; dateFormat: DateFormatKey; delimiter: string } }) =>
    api<{ id: string; supportReference: string; destination: ImportPreview['destination'] }>(base(ws), { method: 'POST', body }),
  preview: (ws: string, id: string) => api<ImportPreview>(`${base(ws)}/${id}/preview`),
  upload: (ws: string, id: string, chunkIndex: number, rows: GridRow[]) =>
    api<{ ok: true; rows: number }>(`${base(ws)}/${id}/upload`, { method: 'POST', body: { chunkIndex, rows } }),
  mapping: (ws: string, id: string, body: { columns: Record<string, string>; grid: GridColumn[]; valueMaps?: ValueMaps; invite?: string[] }) =>
    api<{ ok: true }>(`${base(ws)}/${id}/mapping`, { method: 'PUT', body }),
  start: (ws: string, id: string) => api<HistoryRow>(`${base(ws)}/${id}/start`, { method: 'POST' }),
  cancel: (ws: string, id: string) => api<HistoryRow>(`${base(ws)}/${id}/cancel`, { method: 'POST' }),
  remove: (ws: string, id: string) => api<{ ok: true; deleted: Record<string, number> | null }>(`${base(ws)}/${id}`, { method: 'DELETE' }),
  report: (ws: string, id: string, q?: string) => api<ImportReport>(`${base(ws)}/${id}${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  errorsCsv: (ws: string, id: string) => downloadFile(`${base(ws)}/${id}/errors.csv`),
  sourceFile: (ws: string, id: string) => downloadFile(`${base(ws)}/${id}/file`),
}

export const exportsApi = {
  start: (ws: string, body: { type: 'workspace_csv'; locations: LocationRef[]; dateFormat: 'normal' | 'iso' | 'posix' }) =>
    api<ExportState>(`/workspaces/${ws}/exports`, { method: 'POST', body }),
  status: (ws: string, id: string) => api<ExportState>(`/workspaces/${ws}/exports/${id}`),
}

/**
 * The reviewed rows in chunks of about half a megabyte, so a 100,000-row sheet
 * stays under the API's request limit whatever its cells hold.
 */
export function chunkRows(rows: GridRow[], maxBytes = 512 * 1024): GridRow[][] {
  const chunks: GridRow[][] = []
  let current: GridRow[] = []
  let size = 2
  for (const row of rows) {
    const bytes = new TextEncoder().encode(JSON.stringify(row)).length + 1
    if (current.length && (size + bytes > maxBytes || current.length >= 5_000)) {
      chunks.push(current)
      current = []
      size = 2
    }
    current.push(row)
    size += bytes
  }
  if (current.length) chunks.push(current)
  return chunks
}
