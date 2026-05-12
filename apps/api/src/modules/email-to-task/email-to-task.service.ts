import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import type { Db } from '@rundesk/db'
import {
  listEmailAliases,
  inboundEmailMessages,
  lists,
  tasks,
  taskComments,
  taskAttachments,
  users,
  workspaceMembers,
  projects,
  spaces,
} from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { R2Service } from '../../common/storage/r2.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'

/**
 * Email-to-task: convert inbound emails into rundesk tasks or comments.
 *
 * Address scheme:
 *   list-${localPart}@${INBOUND_EMAIL_DOMAIN}                -> creates a task
 *   list-${localPart}+task-${taskId}@${INBOUND_EMAIL_DOMAIN}  -> appends comment
 *
 * Replies to notification emails are also routed by `In-Reply-To` /
 * `References` headers, since most mail clients drop sub-addressing.
 *
 * Idempotency: every accepted message inserts a row in
 * `inbound_email_messages` keyed by RFC 822 Message-Id. Duplicate
 * deliveries (Postmark retries, Mailgun re-queues) are dropped silently
 * with outcome=`rejected_duplicate`.
 */

export type InboundEmailPayload = {
  /** RFC 822 Message-Id, e.g. `<abc@example.com>` */
  messageId: string
  /** Sender's bare address, e.g. `alice@example.com` */
  fromAddress: string
  fromName?: string
  /** Recipient address that received the email — drives routing. */
  recipient: string
  subject?: string
  textBody?: string
  htmlBody?: string
  /** RFC 5322 In-Reply-To header (single id) */
  inReplyTo?: string
  /** RFC 5322 References header (whitespace-separated ids) */
  references?: string
  attachments?: InboundEmailAttachment[]
}

export type InboundEmailAttachment = {
  fileName: string
  contentType: string
  /** Already-decoded bytes from the email provider */
  content: Buffer
}

export type InboundOutcome =
  | 'task_created'
  | 'comment_added'
  | 'rejected_no_alias'
  | 'rejected_duplicate'
  | 'rejected_too_large'
  | 'rejected_unknown_task'

const MAX_EMAIL_BYTES = 25 * 1024 * 1024 // 25 MB total payload
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024 // 15 MB per attachment
const MAX_ATTACHMENTS = 10
const LOCAL_PART_PREFIX = 'list-'
const TASK_TAG = '+task-'

@Injectable()
export class EmailToTaskService {
  private readonly logger = new Logger(EmailToTaskService.name)

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly r2: R2Service,
    private readonly realtime: RealtimeGateway,
  ) {}

  // ─── alias management ────────────────────────────────────────────────────

  /**
   * Mint (or return the existing) inbound email alias for a list. Idempotent
   * so the UI can "Show address" without thinking about prior state.
   */
  async ensureAlias(listId: string, actorId: string): Promise<AliasView> {
    const existing = await this.findAliasByListId(listId)
    if (existing && !existing.revokedAt) return this.aliasView(existing)
    return this.rotateAlias(listId, actorId)
  }

  /**
   * Rotate the local part — old emails to the previous address bounce
   * (or rather: get rejected with outcome=rejected_no_alias).
   */
  async rotateAlias(listId: string, actorId: string): Promise<AliasView> {
    await this.assertListExists(listId)
    const localPart = await this.mintUniqueLocalPart()
    const [row] = await this.db
      .insert(listEmailAliases)
      .values({ listId, localPart, createdById: actorId })
      .onConflictDoUpdate({
        target: listEmailAliases.listId,
        set: { localPart, revokedAt: null, updatedAt: new Date(), createdById: actorId },
      })
      .returning()
    return this.aliasView(row)
  }

  async revokeAlias(listId: string): Promise<{ ok: true }> {
    await this.db
      .update(listEmailAliases)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(listEmailAliases.listId, listId))
    return { ok: true }
  }

  async getAlias(listId: string): Promise<AliasView | null> {
    const row = await this.findAliasByListId(listId)
    if (!row || row.revokedAt) return null
    return this.aliasView(row)
  }

  // ─── inbound webhook entry point ─────────────────────────────────────────

  /**
   * Accept an inbound email payload, route it, and return the audit
   * outcome. Always logs to `inbound_email_messages` — even rejected
   * messages — so we can debug "why didn't this email land?" later.
   */
  async ingest(payload: InboundEmailPayload): Promise<{
    outcome: InboundOutcome
    taskId?: string
    commentId?: string
    reason?: string
  }> {
    // Idempotency: Postmark / Mailgun retry on 5xx. Always check Message-Id first.
    const dup = await this.findExistingByMessageId(payload.messageId)
    if (dup) {
      this.logger.log(`Skipped duplicate inbound email ${payload.messageId}`)
      return { outcome: 'rejected_duplicate', reason: 'message already processed' }
    }

    const totalBytes = this.estimatePayloadBytes(payload)
    if (totalBytes > MAX_EMAIL_BYTES) {
      await this.recordOutcome(payload, totalBytes, 'rejected_too_large')
      return { outcome: 'rejected_too_large', reason: `Payload ${totalBytes}B exceeds 25MB limit` }
    }

    // Reply routing: if In-Reply-To matches a prior message, append a comment.
    const replyContext = await this.resolveReplyContext(payload)
    if (replyContext) {
      return this.appendComment(payload, replyContext, totalBytes)
    }

    // Otherwise: route via recipient sub-address.
    const route = this.parseRecipient(payload.recipient)
    if (!route) {
      await this.recordOutcome(payload, totalBytes, 'rejected_no_alias', 'recipient not recognized')
      return { outcome: 'rejected_no_alias', reason: `No alias found for ${payload.recipient}` }
    }

    if (route.taskId) {
      const [task] = await this.db.select().from(tasks).where(eq(tasks.id, route.taskId)).limit(1)
      if (!task) {
        await this.recordOutcome(payload, totalBytes, 'rejected_unknown_task')
        return { outcome: 'rejected_unknown_task', reason: `Task ${route.taskId} not found` }
      }
      return this.appendComment(payload, { taskId: route.taskId, listId: task.listId }, totalBytes)
    }

    return this.createTaskFromEmail(payload, route.localPart, totalBytes)
  }

  // ─── private: task / comment creation ─────────────────────────────────────

  private async createTaskFromEmail(
    payload: InboundEmailPayload,
    localPart: string,
    totalBytes: number,
  ): Promise<{ outcome: InboundOutcome; taskId?: string; reason?: string }> {
    const alias = await this.findAliasByLocalPart(localPart)
    if (!alias || alias.revokedAt) {
      await this.recordOutcome(payload, totalBytes, 'rejected_no_alias', 'alias revoked or missing')
      return { outcome: 'rejected_no_alias', reason: 'alias revoked' }
    }

    const authorId = await this.resolveAuthorId(alias.listId, payload.fromAddress, alias.createdById)
    const trimmedAttachments = (payload.attachments ?? []).slice(0, MAX_ATTACHMENTS)

    const [task] = await this.db
      .insert(tasks)
      .values({
        listId: alias.listId,
        title: this.formatSubject(payload.subject) || `Email from ${payload.fromAddress}`,
        description: this.composeDescription(payload),
        priority: alias.defaultPriority as 'urgent' | 'high' | 'normal' | 'low',
        createdById: authorId,
      })
      .returning()

    // Best-effort attachment upload — failures don't sink the whole ingest.
    let attachmentCount = 0
    for (const att of trimmedAttachments) {
      if (att.content.length > MAX_ATTACHMENT_BYTES) continue
      try {
        const key = `inbound-email/${task.id}/${Date.now()}-${this.safeFilename(att.fileName)}`
        await this.r2.putObject(key, att.content, att.contentType, {
          source: 'inbound-email',
          messageId: payload.messageId.slice(0, 200),
        })
        await this.db.insert(taskAttachments).values({
          taskId: task.id,
          uploadedById: authorId,
          fileName: att.fileName,
          contentType: att.contentType,
          sizeBytes: att.content.length,
          storageKey: key,
        })
        attachmentCount += 1
      } catch (err) {
        this.logger.warn(`Failed to persist attachment "${att.fileName}": ${(err as Error).message}`)
      }
    }

    await this.db
      .update(listEmailAliases)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(eq(listEmailAliases.id, alias.id))

    await this.recordOutcome(
      payload,
      totalBytes,
      'task_created',
      null,
      alias.listId,
      task.id,
      attachmentCount,
    )

    this.realtime.emitToList(alias.listId, {
      type: 'task.created',
      listId: alias.listId,
      task: { id: task.id },
    })

    return { outcome: 'task_created', taskId: task.id }
  }

  private async appendComment(
    payload: InboundEmailPayload,
    ctx: { taskId: string; listId: string },
    totalBytes: number,
  ): Promise<{ outcome: InboundOutcome; commentId: string }> {
    const authorId = await this.resolveAuthorId(ctx.listId, payload.fromAddress, null)
    const body = this.stripQuotedReply(payload.textBody ?? this.htmlToText(payload.htmlBody ?? ''))
    const [comment] = await this.db
      .insert(taskComments)
      .values({
        taskId: ctx.taskId,
        authorId,
        body: body || '(empty reply)',
      })
      .returning()

    await this.recordOutcome(
      payload,
      totalBytes,
      'comment_added',
      null,
      ctx.listId,
      ctx.taskId,
      0,
    )

    this.realtime.emitToTask(ctx.taskId, {
      type: 'comment.created',
      taskId: ctx.taskId,
      comment: { id: comment.id, body: comment.body },
    })

    return { outcome: 'comment_added', commentId: comment.id }
  }

  // ─── private: routing ─────────────────────────────────────────────────────

  /**
   * `list-abc123@inbound.example.com` -> { localPart: 'abc123' }
   * `list-abc123+task-uuid@inbound.example.com` -> { localPart: 'abc123', taskId: 'uuid' }
   */
  parseRecipient(recipient: string): { localPart: string; taskId?: string } | null {
    const lower = recipient.trim().toLowerCase()
    const at = lower.indexOf('@')
    if (at < 1) return null
    const left = lower.slice(0, at)
    if (!left.startsWith(LOCAL_PART_PREFIX)) return null
    const rest = left.slice(LOCAL_PART_PREFIX.length)
    const plus = rest.indexOf(TASK_TAG)
    if (plus === -1) {
      // Reject an empty local part — e.g. `list-@…` — that would otherwise
      // route to a meaningless alias and produce ambiguous error logs.
      if (!rest) return null
      return { localPart: rest }
    }
    const localPart = rest.slice(0, plus)
    const taskId = rest.slice(plus + TASK_TAG.length)
    if (!localPart || !taskId) return null
    return { localPart, taskId }
  }

  private async resolveReplyContext(
    payload: InboundEmailPayload,
  ): Promise<{ taskId: string; listId: string } | null> {
    const candidates: string[] = []
    if (payload.inReplyTo) candidates.push(payload.inReplyTo.trim())
    if (payload.references) candidates.push(...payload.references.split(/\s+/).map((s) => s.trim()))

    for (const ref of candidates) {
      if (!ref) continue
      const [row] = await this.db
        .select({ taskId: inboundEmailMessages.taskId, listId: inboundEmailMessages.listId })
        .from(inboundEmailMessages)
        .where(eq(inboundEmailMessages.messageId, ref))
        .limit(1)
      if (row?.taskId && row.listId) return { taskId: row.taskId, listId: row.listId }
    }
    return null
  }

  // ─── private: helpers ─────────────────────────────────────────────────────

  /**
   * Look up a user by their email to attribute the inbound message
   * properly. Falls back to the alias creator (or system bootstrap) so
   * we always have a non-null authorId — the comments / tasks schemas
   * disallow nulls there.
   */
  private async resolveAuthorId(
    listId: string,
    fromAddress: string,
    fallback: string | null,
  ): Promise<string> {
    const normalized = fromAddress.toLowerCase().trim()
    const [byEmail] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalized))
      .limit(1)
    if (byEmail) {
      // Ensure they're a member of the workspace owning this list
      const isMember = await this.userBelongsToList(byEmail.id, listId)
      if (isMember) return byEmail.id
    }
    if (fallback) return fallback
    // Last-resort: any active workspace admin / first member. Inbound mail
    // from strangers gets attributed to the workspace owner.
    const owner = await this.findWorkspaceOwnerForList(listId)
    if (owner) return owner
    throw new BadRequestException(
      'No author available — list has no workspace members and alias has no creator',
    )
  }

  private async userBelongsToList(userId: string, listId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .innerJoin(spaces, eq(spaces.workspaceId, workspaceMembers.workspaceId))
      .innerJoin(projects, eq(projects.spaceId, spaces.id))
      .innerJoin(lists, eq(lists.projectId, projects.id))
      .where(and(eq(workspaceMembers.userId, userId), eq(lists.id, listId)))
      .limit(1)
    return Boolean(row)
  }

  private async findWorkspaceOwnerForList(listId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .innerJoin(spaces, eq(spaces.workspaceId, workspaceMembers.workspaceId))
      .innerJoin(projects, eq(projects.spaceId, spaces.id))
      .innerJoin(lists, eq(lists.projectId, projects.id))
      .where(eq(lists.id, listId))
      .limit(1)
    return row?.userId ?? null
  }

  private async findExistingByMessageId(messageId: string): Promise<{ id: string } | null> {
    const [row] = await this.db
      .select({ id: inboundEmailMessages.id })
      .from(inboundEmailMessages)
      .where(eq(inboundEmailMessages.messageId, messageId))
      .limit(1)
    return row ?? null
  }

  private async findAliasByListId(listId: string) {
    const [row] = await this.db
      .select()
      .from(listEmailAliases)
      .where(eq(listEmailAliases.listId, listId))
      .limit(1)
    return row ?? null
  }

  private async findAliasByLocalPart(localPart: string) {
    const [row] = await this.db
      .select()
      .from(listEmailAliases)
      .where(eq(listEmailAliases.localPart, localPart))
      .limit(1)
    return row ?? null
  }

  private async assertListExists(listId: string) {
    const [row] = await this.db.select({ id: lists.id }).from(lists).where(eq(lists.id, listId)).limit(1)
    if (!row) throw new NotFoundException(`List ${listId} not found`)
  }

  private async mintUniqueLocalPart(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      // 9-char base32 — ~46 bits of entropy, short enough to type if needed
      const candidate = randomBytes(6).toString('base64url').slice(0, 9).toLowerCase()
      const existing = await this.findAliasByLocalPart(candidate)
      if (!existing) return candidate
    }
    throw new Error('Failed to mint unique email alias after 8 attempts')
  }

  private estimatePayloadBytes(payload: InboundEmailPayload): number {
    const textLen = (payload.textBody?.length ?? 0) + (payload.htmlBody?.length ?? 0)
    const attLen = (payload.attachments ?? []).reduce((sum, a) => sum + a.content.length, 0)
    return textLen + attLen
  }

  private formatSubject(subject?: string): string {
    if (!subject) return ''
    return subject.replace(/^(re|fwd?):\s*/i, '').trim().slice(0, 240)
  }

  private composeDescription(payload: InboundEmailPayload): string {
    const text = (payload.textBody ?? this.htmlToText(payload.htmlBody ?? '')).trim()
    const header = `From: ${payload.fromName ? `${payload.fromName} <${payload.fromAddress}>` : payload.fromAddress}`
    return [header, '', this.stripQuotedReply(text)].filter(Boolean).join('\n')
  }

  /** Drop the most common "On ... wrote:" reply quote so comments stay tidy. */
  private stripQuotedReply(text: string): string {
    if (!text) return ''
    const lines = text.split(/\r?\n/)
    const cutAt = lines.findIndex(
      (l) =>
        /^On .* wrote:$/i.test(l.trim()) ||
        /^-+\s*Original Message\s*-+$/i.test(l.trim()) ||
        /^From: .+@/i.test(l.trim()),
    )
    if (cutAt > 0) return lines.slice(0, cutAt).join('\n').trimEnd()
    return text.trimEnd()
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>(\r?\n)?/gi, '\n')
      .replace(/<\/p\s*>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  private safeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 100) || 'attachment'
  }

  private async recordOutcome(
    payload: InboundEmailPayload,
    bytes: number,
    outcome: InboundOutcome,
    reason?: string | null,
    listId?: string,
    taskId?: string,
    attachmentCount?: number,
  ): Promise<void> {
    await this.db.insert(inboundEmailMessages).values({
      messageId: payload.messageId,
      inReplyTo: payload.inReplyTo ?? null,
      fromAddress: payload.fromAddress,
      fromName: payload.fromName ?? null,
      recipient: payload.recipient,
      subject: payload.subject ?? null,
      bytes,
      attachmentCount: attachmentCount ?? (payload.attachments?.length ?? 0),
      outcome,
      reason: reason ?? null,
      listId: listId ?? null,
      taskId: taskId ?? null,
    }).onConflictDoNothing()
  }

  private aliasView(row: {
    id: string
    listId: string
    localPart: string
    defaultPriority: string
    revokedAt: Date | null
    lastUsedAt: Date | null
    createdAt: Date
  }): AliasView {
    const domain = process.env.INBOUND_EMAIL_DOMAIN ?? 'inbound.rundesk.local'
    return {
      id: row.id,
      listId: row.listId,
      localPart: row.localPart,
      address: `${LOCAL_PART_PREFIX}${row.localPart}@${domain}`,
      defaultPriority: row.defaultPriority,
      revokedAt: row.revokedAt,
      lastUsedAt: row.lastUsedAt,
      createdAt: row.createdAt,
    }
  }
}

export type AliasView = {
  id: string
  listId: string
  localPart: string
  address: string
  defaultPriority: string
  revokedAt: Date | null
  lastUsedAt: Date | null
  createdAt: Date
}
