/**
 * FILES PUT ON A TASK, AND FILES SAVED TO THE COMPUTER, for a surface that is
 * not the task sheet: the AI dock's pictures (`ledger-rows/row-870`).
 *
 * A task's file goes the way the sheet's Files puts one: a signed address for
 * the store, the bytes PUT there, then the record naming them. Refused, the
 * API's own words are thrown (an `ApiError`); a store that would not take the
 * bytes throws its status.
 */
import { api } from './api'

export async function uploadTaskFile(taskId: string, file: File): Promise<{ id: string }> {
  const contentType = file.type || 'application/octet-stream'
  const presign = await api<{ uploadUrl: string; storageKey: string }>(`/tasks/${taskId}/attachments/presign`, {
    method: 'POST',
    body: { fileName: file.name, contentType, sizeBytes: file.size },
  })
  const put = await fetch(presign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file })
  if (!put.ok) throw new Error(`The store refused ${file.name} (${put.status})`)
  return api<{ id: string }>(`/tasks/${taskId}/attachments`, {
    method: 'POST',
    body: { fileName: file.name, storageKey: presign.storageKey, contentType, sizeBytes: file.size },
  })
}

/** Each file handed to the browser to save, under its own name. */
export function saveFiles(files: File[]): void {
  for (const file of files) {
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    // After the browser has taken it: revoked at once, a save can find nothing to read.
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }
}
