import { Injectable, Inject, NotFoundException, ConflictException } from '@nestjs/common'
import { eq, and, asc, isNull } from 'drizzle-orm'
import { docs } from '@rundesk/db'
import { workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { SearchService } from '../search/search.service'

type TiptapNode = { type: string; content?: TiptapNode[]; text?: string; attrs?: Record<string, unknown> }

// Extract plaintext for denormalized search.
function extractPlaintext(content: unknown): string {
  if (!content || typeof content !== 'object') return ''
  const node = content as TiptapNode
  if (node.text) return node.text
  if (Array.isArray(node.content)) {
    return node.content.map((n) => extractPlaintext(n)).filter(Boolean).join(' ')
  }
  return ''
}

@Injectable()
export class DocsService {
  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private realtime: RealtimeGateway,
    private search: SearchService,
  ) {}

  private async indexDocInSearch(docId: string) {
    try {
      const [row] = await this.db.select().from(docs).where(eq(docs.id, docId))
      if (!row) return
      await this.search.indexDoc({
        id: row.id,
        title: row.title,
        plaintext: row.plaintext,
        workspaceId: row.workspaceId,
        spaceId: row.spaceId,
        createdAt: row.createdAt,
      })
    } catch {
      // best-effort
    }
  }

  list(workspaceId: string, opts: { spaceId?: string | null; parentDocId?: string | null } = {}) {
    const where = and(
      eq(docs.workspaceId, workspaceId),
      eq(docs.isArchived, false),
      opts.spaceId === null ? isNull(docs.spaceId) : opts.spaceId ? eq(docs.spaceId, opts.spaceId) : undefined,
      opts.parentDocId === null ? isNull(docs.parentDocId) : opts.parentDocId ? eq(docs.parentDocId, opts.parentDocId) : undefined,
    )
    return this.db.select().from(docs).where(where).orderBy(asc(docs.position), asc(docs.createdAt))
  }

  async get(docId: string) {
    const [row] = await this.db.select().from(docs).where(eq(docs.id, docId))
    if (!row) throw new NotFoundException('Doc not found')
    return row
  }

  private async assertDocAccess(docId: string, userId: string) {
    const [row] = await this.db.select().from(docs).where(eq(docs.id, docId))
    if (!row) throw new NotFoundException('Doc not found')
    const [membership] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, row.workspaceId), eq(workspaceMembers.userId, userId)))
    if (!membership) throw new NotFoundException('Doc not found')
    return row
  }

  async getForUser(docId: string, userId: string) {
    return this.assertDocAccess(docId, userId)
  }

  async create(data: {
    workspaceId: string
    spaceId?: string | null
    parentDocId?: string | null
    title?: string
    icon?: string
    createdById: string
  }) {
    const [row] = await this.db
      .insert(docs)
      .values({
        workspaceId: data.workspaceId,
        spaceId: data.spaceId ?? null,
        parentDocId: data.parentDocId ?? null,
        title: data.title?.trim() || 'Untitled',
        icon: data.icon,
        createdById: data.createdById,
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        plaintext: '',
      })
      .returning()
    this.realtime.emitToWorkspace(data.workspaceId, { type: 'doc.updated', docId: row.id, patch: { created: true } })
    void this.indexDocInSearch(row.id)
    return row
  }

  async update(
    docId: string,
    userId: string,
    patch: {
      title?: string
      icon?: string | null
      coverImageUrl?: string | null
      content?: Record<string, unknown>
      parentDocId?: string | null
      spaceId?: string | null
      position?: number
      isArchived?: boolean
      expectedUpdatedAt?: string
    },
  ) {
    await this.assertDocAccess(docId, userId)
    if (patch.expectedUpdatedAt) {
      const [current] = await this.db
        .select({ updatedAt: docs.updatedAt })
        .from(docs)
        .where(eq(docs.id, docId))
      if (!current) throw new NotFoundException('Doc not found')
      const expected = new Date(patch.expectedUpdatedAt).getTime()
      const actual = current.updatedAt ? new Date(current.updatedAt).getTime() : NaN
      if (!Number.isFinite(expected) || expected !== actual) {
        throw new ConflictException('Doc was updated by a teammate. Refresh and retry your save.')
      }
    }
    const set: Record<string, unknown> = { ...patch, updatedAt: new Date() }
    delete set.expectedUpdatedAt
    if (patch.content) set.plaintext = extractPlaintext(patch.content)
    const [row] = await this.db.update(docs).set(set).where(eq(docs.id, docId)).returning()
    if (!row) throw new NotFoundException('Doc not found')
    this.realtime.emitToDoc(docId, { type: 'doc.updated', docId, patch: set as Record<string, unknown> })
    this.realtime.emitToWorkspace(row.workspaceId, { type: 'doc.updated', docId, patch: { updated: true } })
    if (patch.title || patch.content) void this.indexDocInSearch(docId)
    return row
  }

  async delete(docId: string) {
    const [row] = await this.db.update(docs).set({ isArchived: true, updatedAt: new Date() }).where(eq(docs.id, docId)).returning()
    if (!row) throw new NotFoundException('Doc not found')
    this.realtime.emitToWorkspace(row.workspaceId, { type: 'doc.updated', docId, patch: { archived: true } })
    return { ok: true }
  }

  async deleteForUser(docId: string, userId: string) {
    await this.assertDocAccess(docId, userId)
    const [row] = await this.db.update(docs).set({ isArchived: true, updatedAt: new Date() }).where(eq(docs.id, docId)).returning()
    if (!row) throw new NotFoundException('Doc not found')
    this.realtime.emitToWorkspace(row.workspaceId, { type: 'doc.updated', docId, patch: { archived: true } })
    return { ok: true }
  }
}
