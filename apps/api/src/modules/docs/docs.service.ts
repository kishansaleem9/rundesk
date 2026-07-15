import { Injectable, Inject, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common'
import { eq, and, asc, isNull, desc, inArray, isNotNull } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { docs, docComments, docRevisions, docTemplates, users } from '@rundesk/db'
import { workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { SearchService } from '../search/search.service'
import { NotificationsService } from '../notifications/notifications.service'

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
    private notifications: NotificationsService,
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
    await this.snapshotRevision(row, data.createdById)
    this.realtime.emitToWorkspace(data.workspaceId, { type: 'doc.updated', docId: row.id, patch: { created: true } })
    void this.indexDocInSearch(row.id)
    return row
  }

  // ─── Doc templates ─────────────────────────────────────────────────────────

  /** Reusable doc templates in a workspace, most-recent first. */
  async listDocTemplates(workspaceId: string) {
    return this.db
      .select({
        id: docTemplates.id,
        name: docTemplates.name,
        description: docTemplates.description,
        icon: docTemplates.icon,
        createdById: docTemplates.createdById,
        createdAt: docTemplates.createdAt,
        updatedAt: docTemplates.updatedAt,
      })
      .from(docTemplates)
      .where(eq(docTemplates.workspaceId, workspaceId))
      .orderBy(desc(docTemplates.updatedAt))
  }

  /** Snapshot an existing doc's content into a reusable template. */
  async saveDocAsTemplate(
    workspaceId: string,
    userId: string,
    data: { docId: string; name: string; description?: string },
  ) {
    const name = data.name?.trim()
    if (!name) throw new ForbiddenException('Template name is required')
    const [doc] = await this.db.select().from(docs).where(eq(docs.id, data.docId)).limit(1)
    if (!doc || doc.workspaceId !== workspaceId) throw new NotFoundException('Doc not found in this workspace')
    const [row] = await this.db
      .insert(docTemplates)
      .values({
        workspaceId,
        name,
        description: data.description?.trim() || null,
        icon: doc.icon,
        content: doc.content,
        plaintext: doc.plaintext,
        createdById: userId,
      })
      .returning()
    return row
  }

  /** Create a brand-new doc from a template's snapshot content. */
  async createDocFromTemplate(
    workspaceId: string,
    userId: string,
    templateId: string,
    opts: { spaceId?: string | null; title?: string } = {},
  ) {
    const [template] = await this.db.select().from(docTemplates).where(eq(docTemplates.id, templateId)).limit(1)
    if (!template || template.workspaceId !== workspaceId) throw new NotFoundException('Template not found in this workspace')

    const [row] = await this.db
      .insert(docs)
      .values({
        workspaceId,
        spaceId: opts.spaceId ?? null,
        title: opts.title?.trim() || template.name,
        icon: template.icon,
        createdById: userId,
        content: template.content,
        plaintext: template.plaintext,
      })
      .returning()
    await this.snapshotRevision(row, userId)
    this.realtime.emitToWorkspace(workspaceId, { type: 'doc.updated', docId: row.id, patch: { created: true } })
    void this.indexDocInSearch(row.id)
    return row
  }

  /** Delete a doc template (workspace-scoped). */
  async deleteDocTemplate(workspaceId: string, templateId: string) {
    const [row] = await this.db
      .delete(docTemplates)
      .where(and(eq(docTemplates.id, templateId), eq(docTemplates.workspaceId, workspaceId)))
      .returning({ id: docTemplates.id })
    if (!row) throw new NotFoundException('Template not found')
    return { ok: true }
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
    if (patch.content) await this.snapshotRevision(row, userId)
    this.realtime.emitToDoc(docId, { type: 'doc.updated', docId, patch: set as Record<string, unknown> })
    this.realtime.emitToWorkspace(row.workspaceId, { type: 'doc.updated', docId, patch: { updated: true } })
    if (patch.title || patch.content) void this.indexDocInSearch(docId)
    return row
  }

  // ─── Version history ───────────────────────────────────────────────────────

  // Snapshot the given doc state. Consecutive saves by the same editor within a
  // 2-minute window coalesce into the latest snapshot so history stays readable.
  private async snapshotRevision(
    doc: { id: string; workspaceId: string; title: string; content: Record<string, unknown>; plaintext: string },
    editorId: string,
  ) {
    const [latest] = await this.db
      .select({ id: docRevisions.id, editorId: docRevisions.editorId, updatedAt: docRevisions.updatedAt })
      .from(docRevisions)
      .where(eq(docRevisions.docId, doc.id))
      .orderBy(desc(docRevisions.updatedAt))
      .limit(1)
    const within = latest?.updatedAt ? Date.now() - new Date(latest.updatedAt).getTime() < 2 * 60 * 1000 : false
    if (latest && latest.editorId === editorId && within) {
      await this.db
        .update(docRevisions)
        .set({ title: doc.title, content: doc.content, plaintext: doc.plaintext, updatedAt: new Date() })
        .where(eq(docRevisions.id, latest.id))
      return
    }
    await this.db.insert(docRevisions).values({
      docId: doc.id,
      workspaceId: doc.workspaceId,
      editorId,
      title: doc.title,
      content: doc.content,
      plaintext: doc.plaintext,
    })
  }

  async listRevisions(docId: string, userId: string) {
    await this.assertDocAccess(docId, userId)
    const rows = await this.db
      .select({
        id: docRevisions.id,
        title: docRevisions.title,
        createdAt: docRevisions.createdAt,
        updatedAt: docRevisions.updatedAt,
        editor: { id: users.id, displayName: users.displayName, avatarUrl: users.avatarUrl },
      })
      .from(docRevisions)
      .leftJoin(users, eq(users.id, docRevisions.editorId))
      .where(eq(docRevisions.docId, docId))
      .orderBy(desc(docRevisions.updatedAt))
      .limit(100)
    return rows
  }

  async getRevision(docId: string, revisionId: string, userId: string) {
    await this.assertDocAccess(docId, userId)
    const [row] = await this.db
      .select()
      .from(docRevisions)
      .where(and(eq(docRevisions.id, revisionId), eq(docRevisions.docId, docId)))
      .limit(1)
    if (!row) throw new NotFoundException('Revision not found')
    return row
  }

  // Restore a past revision by writing its content back through the normal
  // update path (which itself snapshots the pre-restore state).
  async restoreRevision(docId: string, revisionId: string, userId: string) {
    const rev = await this.getRevision(docId, revisionId, userId)
    return this.update(docId, userId, { title: rev.title, content: rev.content })
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

  // ─── Public anonymous share ─────────────────────────────────────────────────

  /**
   * Turn on public read-only sharing for the doc. Returns the slug for the
   * /d/<slug> route. Idempotent: returns the existing slug if already shared.
   */
  async enablePublicShare(docId: string, userId: string) {
    const doc = await this.assertDocAccess(docId, userId)
    if (doc.publicShareId) {
      return { publicShareId: doc.publicShareId, publicShareEnabledAt: doc.publicShareEnabledAt }
    }
    const slug = randomBytes(12).toString('base64url')
    const [row] = await this.db
      .update(docs)
      .set({ publicShareId: slug, publicShareEnabledAt: new Date(), updatedAt: new Date() })
      .where(eq(docs.id, docId))
      .returning()
    this.realtime.emitToWorkspace(doc.workspaceId, {
      type: 'doc.updated',
      docId,
      patch: { publicShareId: row.publicShareId },
    })
    return { publicShareId: row.publicShareId, publicShareEnabledAt: row.publicShareEnabledAt }
  }

  async disablePublicShare(docId: string, userId: string) {
    const doc = await this.assertDocAccess(docId, userId)
    if (!doc.publicShareId) return { ok: true }
    await this.db
      .update(docs)
      .set({ publicShareId: null, publicShareEnabledAt: null, updatedAt: new Date() })
      .where(eq(docs.id, docId))
    this.realtime.emitToWorkspace(doc.workspaceId, {
      type: 'doc.updated',
      docId,
      patch: { publicShareId: null },
    })
    return { ok: true }
  }

  /**
   * Anonymous lookup by share slug. Returns only the fields safe for public
   * viewers: title, icon, cover, content, updated_at. Comments, ACL state,
   * and member identity are deliberately excluded.
   */
  async getByPublicShare(slug: string) {
    if (!slug || slug.length > 64) throw new NotFoundException('Doc not found')
    const [row] = await this.db
      .select({
        id: docs.id,
        title: docs.title,
        icon: docs.icon,
        coverImageUrl: docs.coverImageUrl,
        content: docs.content,
        updatedAt: docs.updatedAt,
        publicShareId: docs.publicShareId,
        isArchived: docs.isArchived,
      })
      .from(docs)
      .where(and(eq(docs.publicShareId, slug), isNotNull(docs.publicShareId)))
      .limit(1)
    if (!row || row.isArchived) throw new NotFoundException('Doc not found')
    return {
      id: row.id,
      title: row.title,
      icon: row.icon,
      coverImageUrl: row.coverImageUrl,
      content: row.content,
      updatedAt: row.updatedAt,
    }
  }

  // ─── Comments ───────────────────────────────────────────────────────────────

  async listComments(docId: string, userId: string, opts: { includeResolved?: boolean } = {}) {
    const doc = await this.assertDocAccess(docId, userId)
    const rows = await this.db
      .select({
        id: docComments.id,
        docId: docComments.docId,
        workspaceId: docComments.workspaceId,
        authorId: docComments.authorId,
        parentCommentId: docComments.parentCommentId,
        body: docComments.body,
        selection: docComments.selection,
        isResolved: docComments.isResolved,
        resolvedById: docComments.resolvedById,
        resolvedAt: docComments.resolvedAt,
        createdAt: docComments.createdAt,
        updatedAt: docComments.updatedAt,
        authorName: users.displayName,
        authorEmail: users.email,
        authorAvatarUrl: users.avatarUrl,
      })
      .from(docComments)
      .leftJoin(users, eq(users.id, docComments.authorId))
      .where(eq(docComments.docId, docId))
      .orderBy(asc(docComments.createdAt))
    const filtered = opts.includeResolved === false ? rows.filter((r) => !r.isResolved) : rows
    return { docId: doc.id, workspaceId: doc.workspaceId, comments: filtered }
  }

  async createComment(
    docId: string,
    userId: string,
    body: { body: string; parentCommentId?: string | null; selection?: { from: number; to: number; quote?: string } | null },
  ) {
    const doc = await this.assertDocAccess(docId, userId)
    const trimmed = body.body?.trim()
    if (!trimmed) throw new ConflictException('Comment body is required')
    if (body.parentCommentId) {
      const [parent] = await this.db
        .select({ id: docComments.id, docId: docComments.docId })
        .from(docComments)
        .where(eq(docComments.id, body.parentCommentId))
        .limit(1)
      if (!parent || parent.docId !== docId) {
        throw new NotFoundException('Parent comment not found')
      }
    }
    const [created] = await this.db
      .insert(docComments)
      .values({
        docId,
        workspaceId: doc.workspaceId,
        authorId: userId,
        parentCommentId: body.parentCommentId ?? null,
        body: trimmed,
        selection: body.selection ?? null,
      })
      .returning()
    this.realtime.emitToDoc(docId, {
      type: 'doc.comment.created',
      docId,
      commentId: created.id,
      parentCommentId: created.parentCommentId,
    })
    void this.notifyDocCommentRecipients(doc, created, userId, trimmed)
    return created
  }

  /**
   * Notify the doc creator, the parent comment author (for replies), and any
   * @-mentioned workspace members. Always best-effort.
   */
  private async notifyDocCommentRecipients(
    doc: typeof docs.$inferSelect,
    comment: typeof docComments.$inferSelect,
    actorId: string,
    bodyText: string,
  ) {
    try {
      const recipients = new Map<string, 'mention' | 'reply' | 'author'>()

      if (doc.createdById && doc.createdById !== actorId) {
        recipients.set(doc.createdById, 'author')
      }

      if (comment.parentCommentId) {
        const [parent] = await this.db
          .select({ authorId: docComments.authorId })
          .from(docComments)
          .where(eq(docComments.id, comment.parentCommentId))
          .limit(1)
        if (parent?.authorId && parent.authorId !== actorId) {
          recipients.set(parent.authorId, 'reply')
        }
      }

      const mentionedIds = await this.resolveMentions(doc.workspaceId, bodyText)
      for (const userId of mentionedIds) {
        if (userId !== actorId) recipients.set(userId, 'mention')
      }

      if (recipients.size === 0) return

      const docTitle = doc.title || 'Untitled doc'
      const snippet = bodyText.slice(0, 240)
      for (const [userId, kind] of recipients) {
        const type = kind === 'mention' ? 'doc_mentioned' : 'doc_commented'
        const title =
          kind === 'mention'
            ? `You were mentioned in "${docTitle}"`
            : kind === 'reply'
            ? `Reply to your comment on "${docTitle}"`
            : `New comment on "${docTitle}"`
        await this.notifications.create({
          userId,
          workspaceId: doc.workspaceId,
          actorId,
          type,
          title,
          body: snippet,
          target: {
            entityType: 'doc',
            entityId: doc.id,
            url: `/app/${doc.workspaceId}/docs?doc=${doc.id}`,
          },
          emailContext: { commentSnippet: snippet },
        })
      }
    } catch (err) {
      // best-effort; never break the comment write
      // eslint-disable-next-line no-console
      console.error('[docs.notifyDocCommentRecipients] failed:', err)
    }
  }

  /**
   * Extract @-mentions from a comment body and resolve them to workspace
   * member user ids. Mentions match common formats:
   *   - @[Display Name](user:uuid)
   *   - @email@example.com
   *   - bare @username substrings against workspace display names
   */
  private async resolveMentions(workspaceId: string, text: string): Promise<string[]> {
    if (!text || text.length < 2) return []
    const ids = new Set<string>()

    const refMatches = text.matchAll(/@\[[^\]]+\]\(user:([0-9a-f-]{36})\)/gi)
    for (const m of refMatches) ids.add(m[1])

    const emailMatches = text.matchAll(/@([\w.+-]+@[\w-]+\.[\w.-]+)/g)
    const emails = Array.from(emailMatches, (m) => m[1].toLowerCase())
    if (emails.length > 0) {
      const rows = await this.db
        .select({ userId: users.id, email: users.email })
        .from(users)
        .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), inArray(users.email, emails)))
      for (const r of rows) ids.add(r.userId)
    }

    const nameTokens = Array.from(text.matchAll(/@([a-zA-Z][\w-]{1,40})/g), (m) => m[1].toLowerCase())
    if (nameTokens.length > 0) {
      const memberRows = await this.db
        .select({ userId: users.id, name: users.displayName, email: users.email })
        .from(users)
        .innerJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
        .where(eq(workspaceMembers.workspaceId, workspaceId))
      for (const token of nameTokens) {
        for (const row of memberRows) {
          const normalizedName = (row.name ?? '').toLowerCase().replace(/\s+/g, '')
          const localPart = (row.email ?? '').split('@')[0].toLowerCase()
          if (normalizedName.includes(token) || localPart === token) {
            ids.add(row.userId)
          }
        }
      }
    }

    return Array.from(ids)
  }

  async updateComment(commentId: string, userId: string, patch: { body?: string }) {
    const [existing] = await this.db.select().from(docComments).where(eq(docComments.id, commentId)).limit(1)
    if (!existing) throw new NotFoundException('Comment not found')
    await this.assertDocAccess(existing.docId, userId)
    if (existing.authorId && existing.authorId !== userId) {
      throw new ForbiddenException('Only the author can edit this comment')
    }
    const trimmed = patch.body?.trim()
    if (!trimmed) throw new ConflictException('Comment body is required')
    const [updated] = await this.db
      .update(docComments)
      .set({ body: trimmed, updatedAt: new Date() })
      .where(eq(docComments.id, commentId))
      .returning()
    this.realtime.emitToDoc(existing.docId, {
      type: 'doc.comment.updated',
      docId: existing.docId,
      commentId,
    })
    return updated
  }

  async setCommentResolution(commentId: string, userId: string, resolved: boolean) {
    const [existing] = await this.db.select().from(docComments).where(eq(docComments.id, commentId)).limit(1)
    if (!existing) throw new NotFoundException('Comment not found')
    await this.assertDocAccess(existing.docId, userId)
    const [updated] = await this.db
      .update(docComments)
      .set({
        isResolved: resolved,
        resolvedById: resolved ? userId : null,
        resolvedAt: resolved ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(docComments.id, commentId))
      .returning()
    this.realtime.emitToDoc(existing.docId, {
      type: 'doc.comment.resolution_changed',
      docId: existing.docId,
      commentId,
      isResolved: resolved,
    })

    if (resolved) {
      void this.notifyDocCommentResolved(existing, userId)
    }

    return updated
  }

  private async notifyDocCommentResolved(
    comment: typeof docComments.$inferSelect,
    actorId: string,
  ) {
    try {
      const [doc] = await this.db.select().from(docs).where(eq(docs.id, comment.docId)).limit(1)
      if (!doc) return

      const recipientIds = new Set<string>()
      if (comment.authorId && comment.authorId !== actorId) recipientIds.add(comment.authorId)

      if (comment.parentCommentId) {
        const [parent] = await this.db
          .select({ authorId: docComments.authorId })
          .from(docComments)
          .where(eq(docComments.id, comment.parentCommentId))
          .limit(1)
        if (parent?.authorId && parent.authorId !== actorId) recipientIds.add(parent.authorId)
      }

      if (recipientIds.size === 0) return

      const docTitle = doc.title || 'Untitled doc'
      const snippet = comment.body.slice(0, 240)
      const target = {
        entityType: 'doc' as const,
        entityId: doc.id,
        url: `/app/${doc.workspaceId}/docs?doc=${doc.id}`,
      }

      for (const userId of recipientIds) {
        await this.notifications.create({
          userId,
          workspaceId: doc.workspaceId,
          actorId,
          type: 'doc_commented',
          title: `Your comment was resolved on "${docTitle}"`,
          body: snippet,
          target,
          emailContext: { commentSnippet: snippet },
        })
      }
    } catch {
      // Best-effort
    }
  }

  async deleteComment(commentId: string, userId: string) {
    const [existing] = await this.db.select().from(docComments).where(eq(docComments.id, commentId)).limit(1)
    if (!existing) throw new NotFoundException('Comment not found')
    await this.assertDocAccess(existing.docId, userId)
    if (existing.authorId && existing.authorId !== userId) {
      throw new ForbiddenException('Only the author can delete this comment')
    }
    await this.db.delete(docComments).where(eq(docComments.id, commentId))
    this.realtime.emitToDoc(existing.docId, {
      type: 'doc.comment.removed',
      docId: existing.docId,
      commentId,
    })
    return { ok: true }
  }
}
