import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../../common/database/database.module'
import { R2Service } from '../../../common/storage/r2.service'
import { safeFileName } from '../../../common/storage/file-name'

/**
 * A FILE TO IMPORT, KEPT IN THE STORE WHILE IT IS IMPORTED (`commit-log/log-601eacc-2`).
 *
 * An Excel workbook, a Word document, Confluence's space export and Slack's
 * export are binary, and the last two are hundreds of megabytes: none of them
 * survives being read as text into a JSON body, which the API caps at 1 MiB.
 * So the page uploads the file straight to the store, as a task's files go
 * (`presignPutObject`), and the import names it by its key.
 *
 * WHOSE FILE IT IS, IS IN ITS KEY: `workspaces/<ws>/imports/<user>/…`. An
 * import reads only a key under its importer's own place, so nobody imports a
 * file somebody else uploaded by knowing its key; and it is under the
 * workspace's prefix, which deleting the workspace for good empties.
 *
 * NOTHING IS KEPT LONGER THAN IT IS NEEDED: a run deletes its file when it
 * ends, and each new upload clears the uploader's files older than a day —
 * those previewed and never imported.
 */

export type ImportPurpose = 'sheet' | 'doc' | 'confluence' | 'slack'

/** The most each kind of file may hold, which its import checks again before reading it. */
export const IMPORT_FILE_LIMITS: Record<ImportPurpose, number> = {
  sheet: 25 * 1024 * 1024,
  doc: 25 * 1024 * 1024,
  confluence: 200 * 1024 * 1024,
  slack: 200 * 1024 * 1024,
}

export const IMPORT_FILE_REFUSALS = {
  noStore: 'File storage is not configured on this server, so a file cannot be uploaded to import: ask an administrator',
  guest: 'Guests do not import files',
  purpose: 'Say what the file is for: a sheet, a doc, a Confluence export or a Slack export',
  notYours: 'That file was not uploaded by you here: choose it again',
  gone: 'The uploaded file is gone, perhaps cleared after a day: choose it again',
  tooLarge: (limit: number) => `The file is larger than ${Math.round(limit / (1024 * 1024))} MB, which is as much as this import reads`,
} as const

/** Where one person's import files are kept in one workspace. */
export const importFilePrefix = (workspaceId: string, userId: string) => `workspaces/${workspaceId}/imports/${userId}/`

/** A key this importer may read: under their own place, one segment below it, and no way out of it. */
export function isOwnImportKey(key: unknown, workspaceId: string, userId: string): key is string {
  if (typeof key !== 'string') return false
  const prefix = importFilePrefix(workspaceId, userId)
  if (!key.startsWith(prefix)) return false
  const rest = key.slice(prefix.length)
  return /^[A-Za-z0-9._-]+$/.test(rest) && !rest.includes('..')
}

const DAY_MS = 24 * 60 * 60 * 1000

@Injectable()
export class ImportFilesService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly r2: R2Service,
  ) {}

  /** Where to put a file to import, and the key its import will name it by. A guest imports only a document. */
  async createUpload(
    workspaceId: string,
    userId: string,
    body: { fileName?: unknown; contentType?: unknown; sizeBytes?: unknown; purpose?: unknown },
  ) {
    const purpose = body?.purpose
    if (purpose !== 'sheet' && purpose !== 'doc' && purpose !== 'confluence' && purpose !== 'slack') {
      throw new BadRequestException(IMPORT_FILE_REFUSALS.purpose)
    }
    const [member] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!member) throw new ForbiddenException('You are not a member of this workspace')
    if (member.role === 'guest' && purpose !== 'doc') throw new ForbiddenException(IMPORT_FILE_REFUSALS.guest)
    if (!this.r2.configured) throw new BadRequestException(IMPORT_FILE_REFUSALS.noStore)
    const limit = IMPORT_FILE_LIMITS[purpose]
    const size = Number(body?.sizeBytes)
    if (Number.isFinite(size) && size > limit) throw new BadRequestException(IMPORT_FILE_REFUSALS.tooLarge(limit))

    await this.clearStale(workspaceId, userId).catch(() => undefined)
    // Dots run together are one: a key holding `..` is one `read` refuses.
    const name = safeFileName(body?.fileName, 'import').replace(/\.{2,}/g, '.')
    const fileKey = `${importFilePrefix(workspaceId, userId)}${Date.now()}-${name}`
    const contentType = typeof body?.contentType === 'string' && body.contentType ? body.contentType : 'application/octet-stream'
    const uploadUrl = await this.r2.presignPutObject(fileKey, contentType, { uploadedby: userId, purpose })
    return { uploadUrl, fileKey, maxBytes: limit }
  }

  /** The file's bytes, read for its own importer only, and only up to its kind's limit. */
  async read(workspaceId: string, userId: string, fileKey: unknown, purpose: ImportPurpose): Promise<Buffer> {
    if (!isOwnImportKey(fileKey, workspaceId, userId)) throw new ForbiddenException(IMPORT_FILE_REFUSALS.notYours)
    if (!this.r2.configured) throw new BadRequestException(IMPORT_FILE_REFUSALS.noStore)
    const limit = IMPORT_FILE_LIMITS[purpose]
    let size: number | undefined
    try {
      size = (await this.r2.headObject(fileKey)).ContentLength
    } catch {
      throw new BadRequestException(IMPORT_FILE_REFUSALS.gone)
    }
    if (size !== undefined && size > limit) throw new BadRequestException(IMPORT_FILE_REFUSALS.tooLarge(limit))
    const bytes = await this.r2.getObject(fileKey).catch(() => {
      throw new BadRequestException(IMPORT_FILE_REFUSALS.gone)
    })
    if (bytes.length > limit) throw new BadRequestException(IMPORT_FILE_REFUSALS.tooLarge(limit))
    return bytes
  }

  /** The file, gone once its run has ended. Best-effort: the next upload clears what this misses. */
  async discard(workspaceId: string, userId: string, fileKey: unknown): Promise<void> {
    if (!isOwnImportKey(fileKey, workspaceId, userId) || !this.r2.configured) return
    await this.r2.deleteObject(fileKey).catch(() => undefined)
  }

  /** The uploader's files older than a day: previewed, perhaps, and never imported. */
  private async clearStale(workspaceId: string, userId: string) {
    const cutoff = Date.now() - DAY_MS
    for (const o of await this.r2.listAllObjects(importFilePrefix(workspaceId, userId))) {
      if (o.Key && o.LastModified && o.LastModified.getTime() < cutoff) await this.r2.deleteObject(o.Key).catch(() => undefined)
    }
  }
}
