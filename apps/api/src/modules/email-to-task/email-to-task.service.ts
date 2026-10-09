import {
  Injectable,
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import type { Db } from '@rundesk/db'
import {
  listEmailAliases,
  inboundEmailMessages,
  outboundEmailMessages,
  taskCommentEmails,
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
import { sameEmail } from '../../common/sql/same-email'
import { R2Service } from '../../common/storage/r2.service'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { taskCommentAllowed } from '../../common/permissions/task-write'
import { canCreateTaskIn, heldInTrash, listTrashState } from '../../common/permissions/task-create'
import { isUuid } from '../../common/validation/uuid'
import { EMAIL_REPLY_PREFIX, LOCAL_PART_PREFIX, TASK_TAG, inboundDomain, taskAddressMatches, taskReplyAddress } from './task-address'

/**
 * Email-to-task: convert inbound emails into rundesk tasks or comments.
 *
 * Address scheme:
 *   list-${localPart}@${INBOUND_EMAIL_DOMAIN}                -> creates a task
 *   list-${localPart}+task-${taskId}@${INBOUND_EMAIL_DOMAIN}  -> appends comment
 *
 * Replies to notification emails are also routed by `In-Reply-To` /
 * `References` headers, since most mail clients drop sub-addressing: a comment
 * notification's Message-ID is kept with its task (`outbound_email_messages`),
 * and a reply names it. Until that was kept, this sentence was untrue: only
 * inbound Message-IDs were, and a reply names an outbound one
 * (`resume-defects/resume-8-reply-routing`).
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
  | 'rejected_not_allowed'

const MAX_EMAIL_BYTES = 25 * 1024 * 1024 // 25 MB total payload
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024 // 15 MB per attachment
const MAX_ATTACHMENTS = 10

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
   *
   * Asked of its caller before an address is handed back, as `GET` and a mint
   * ask it: it returned a live address to anybody who could name the list, so a
   * member of a view-only space, refused the address by `GET` (403), was given
   * it by `POST` (201), and their mail to it made a task in the list
   * (`found-6-oct/list-address-given-by-post-to-those-who-may-not-add`).
   */
  async ensureAlias(listId: string, actorId: string): Promise<AliasView> {
    await this.assertListExists(listId)
    await this.assertCanManageAlias(listId, actorId)
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
    await this.assertCanManageAlias(listId, actorId)
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

  async revokeAlias(listId: string, actorId?: string): Promise<{ ok: true }> {
    if (actorId) await this.assertCanManageAlias(listId, actorId)
    await this.db
      .update(listEmailAliases)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(listEmailAliases.listId, listId))
    return { ok: true }
  }

  /*
   * GIVING A LIST AN ADDRESS, ROTATING OR REVOKING IT, IS FOR THOSE WHO MAY ADD
   * TASKS TO IT — the create gate, as reading the address is: mail to it adds a
   * task. It was the list's maker's or a manager's, so a member with Full edit
   * could not give the admin's list an address, and one who had made a list in
   * a space since narrowed still could (`found-25-sep/sharing-asks-the-maker-not-the-level`).
   *
   * EVEN IN THE TRASH (`evenInTrash`): a list in the trash takes no task, mailed
   * or not, but its address is still its own to read, rotate and switch off. The
   * gate's trash refusal reached here as a plain no, so after `DELETE /lists/:id`
   * the admin who had minted the address was refused all three (403), while
   * mail to it went on making tasks.
   */
  private async assertCanManageAlias(listId: string, actorId: string) {
    if (!(await canCreateTaskIn(this.db, listId, actorId, { evenInTrash: true }))) {
      throw new ForbiddenException('Only those who may add tasks to this list manage its email address')
    }
  }

  /**
   * THE LIST'S ADDRESS, FOR THOSE WHO MAY ADD TASKS TO IT — the create gate.
   * Mail to it makes a task for whoever sends it: ClickUp's Email to List,
   * whose address is the permission (help centre: a guest "can create tasks via
   * email if the address is shared with them", and cannot see it in ClickUp).
   * It was answered to every reader of the list: measured on lane 3, a guest
   * with a view share and a member of a view-only space each read it, and each
   * mailed a task into a list that refuses them one (403)
   * (`found-25-sep/list-address-read-by-those-who-may-not-add`).
   */
  async getAlias(listId: string, readerId: string): Promise<AliasView | null> {
    // In the trash too, as managing it is (`assertCanManageAlias`).
    if (!(await canCreateTaskIn(this.db, listId, readerId, { evenInTrash: true }))) {
      throw new ForbiddenException('Only those who may add tasks to this list see its email address')
    }
    return this.liveAlias(listId)
  }

  private async liveAlias(listId: string): Promise<AliasView | null> {
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

    // An email sent from a task's comment box, answered at its own address (`emailReplyAddress`).
    const replyId = this.parseReplyRecipient(payload.recipient)
    if (replyId) {
      const [sent] = await this.db
        .select({ taskId: outboundEmailMessages.taskId, listId: outboundEmailMessages.listId, commentId: outboundEmailMessages.commentId })
        .from(outboundEmailMessages)
        .where(eq(outboundEmailMessages.id, replyId))
        .limit(1)
      if (sent) return this.appendComment(payload, { taskId: sent.taskId, listId: sent.listId, commentId: sent.commentId }, totalBytes)
      await this.recordOutcome(payload, totalBytes, 'rejected_no_alias', 'reply address not recognized')
      return { outcome: 'rejected_no_alias', reason: `No email sent from a task answers to ${payload.recipient}` }
    }

    // Otherwise: route via recipient sub-address.
    const route = this.parseRecipient(payload.recipient)
    if (!route) {
      await this.recordOutcome(payload, totalBytes, 'rejected_no_alias', 'recipient not recognized')
      return { outcome: 'rejected_no_alias', reason: `No alias found for ${payload.recipient}` }
    }

    if (route.taskId) {
      const [task] = isUuid(route.taskId)
        ? await this.db.select().from(tasks).where(eq(tasks.id, route.taskId)).limit(1)
        : []
      /*
       * A TASK'S ADDRESS CARRIES ITS LIST'S ALIAS — as a tag of it now
       * (`taskAddressTag`) — and that is what makes it one
       * (`found-25-sep/inbound-email-comments-skip-the-comment-rule`). Only the
       * task id was read, so `list-anything+task-<id>@…` commented on any task
       * whose id somebody had — the alias, the list's secret, was never
       * compared. An address naming another list's alias, or none, is no
       * task's address.
       */
      const alias = task ? await this.findAliasByListId(task.listId) : null
      if (!task || !alias || alias.revokedAt || !taskAddressMatches(route.localPart, alias.localPart, task.id)) {
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
    /*
     * A LIST IN THE TRASH TAKES NO TASK, MAILED OR NOT (`ListInTrashException`,
     * `found-5-oct/default-list-files-into-an-archived-list`). This inserts the
     * task itself, past `createTask` and its gate, so mail to a deleted list's
     * address went on making tasks in it (201 "task_created"), out of every list
     * of lists, for the list's purge to take. Recorded, as every refusal here is.
     */
    if ((await listTrashState(this.db, alias.listId))?.inTrash) {
      await this.recordOutcome(payload, totalBytes, 'rejected_not_allowed', 'the list is in the trash', alias.listId)
      return { outcome: 'rejected_not_allowed', reason: 'the list is in the trash' }
    }
    // Nor one whose project, folder or space is (`found-6-oct/task-fallback-files-into-a-deleted-project`).
    const held = await heldInTrash(this.db, alias.listId)
    if (held) {
      const reason = `the list's ${held.where} is in the trash`
      await this.recordOutcome(payload, totalBytes, 'rejected_not_allowed', reason, alias.listId)
      return { outcome: 'rejected_not_allowed', reason }
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
    ctx: { taskId: string; listId: string; commentId?: string | null },
    totalBytes: number,
  ): Promise<{ outcome: InboundOutcome; commentId?: string; reason?: string }> {
    /*
     * A COMMENT BY MAIL IS ITS SENDER'S, AND ASKS WHAT THE APP ASKS
     * (`found-25-sep/inbound-email-comments-skip-the-comment-rule`). The author
     * was whoever the From address named among the workspace's members, and
     * anybody else was put down as the workspace's owner — measured: a stranger's
     * mail became a member's comment, and a view-only member and a guest with
     * nothing shared each commented by mail where the app refuses them (403).
     * A sender who may not comment on this task is refused, and the refusal
     * recorded; no comment is written in somebody else's name.
     */
    /*
     * A REPLY TO AN EMAIL SENT FROM THE TASK, BY SOMEBODY IT WENT TO
     * (`resume-defects/s4-composer-email`): ClickUp's Email ClickApp lands the
     * replies of the people emailed — who are not on ClickUp — in the task's
     * activity. Taken when the sender is one of that email's recipients, and
     * written down as its writer's thread, the sender's address beside it; a
     * stranger who learns the reply address is still refused, as any mail is
     * from somebody who may not comment.
     */
    const thread = ctx.commentId ? await this.emailThread(ctx.commentId, payload.fromAddress) : null
    const authorId = (thread?.fromRecipient ? thread.writerId : null) ?? (await this.memberWhoMayComment(ctx.taskId, payload.fromAddress))
    if (!authorId) {
      await this.recordOutcome(payload, totalBytes, 'rejected_not_allowed', 'the sender may not comment on this task', ctx.listId, ctx.taskId)
      return { outcome: 'rejected_not_allowed', reason: 'the sender may not comment on this task' }
    }
    const body = this.stripQuotedReply(payload.textBody ?? this.htmlToText(payload.htmlBody ?? ''))
    const [comment] = await this.db
      .insert(taskComments)
      .values({
        taskId: ctx.taskId,
        authorId,
        body: body || '(empty reply)',
        // An answer to an email from the task is part of that email's thread.
        ...(thread ? { channel: 'email', parentCommentId: thread.rootId } : {}),
      })
      .returning()
    if (thread) {
      await this.db.insert(taskCommentEmails).values({
        commentId: comment.id,
        direction: 'in',
        fromAddress: payload.fromAddress.trim().toLowerCase(),
        toAddresses: [payload.recipient.trim().toLowerCase()],
        subject: payload.subject ?? '',
        messageId: payload.messageId,
      })
    }

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

  /** `reply-<id>@domain` — an email sent from a task's comment box (`emailReplyAddress`) — names that email's row. */
  parseReplyRecipient(recipient: string): string | null {
    const lower = recipient.trim().toLowerCase()
    const at = lower.indexOf('@')
    if (at < 1) return null
    const left = lower.slice(0, at)
    if (!left.startsWith(EMAIL_REPLY_PREFIX)) return null
    const id = left.slice(EMAIL_REPLY_PREFIX.length)
    return isUuid(id) ? id : null
  }

  /**
   * The email comment a reply answers: the thread it belongs to (a comment's
   * replies hang off its first comment, so an answer to a later email of the
   * thread joins the same one), who wrote that email, and whether `fromAddress`
   * is one of the people it went to.
   */
  private async emailThread(commentId: string, fromAddress: string): Promise<{ rootId: string; writerId: string; fromRecipient: boolean } | null> {
    const [row] = await this.db
      .select({
        writerId: taskComments.authorId,
        parentId: taskComments.parentCommentId,
        to: taskCommentEmails.toAddresses,
        cc: taskCommentEmails.ccAddresses,
        bcc: taskCommentEmails.bccAddresses,
      })
      .from(taskCommentEmails)
      .innerJoin(taskComments, eq(taskComments.id, taskCommentEmails.commentId))
      .where(and(eq(taskCommentEmails.commentId, commentId), eq(taskCommentEmails.direction, 'out')))
      .limit(1)
    if (!row) return null
    const from = fromAddress.trim().toLowerCase()
    return {
      rootId: row.parentId ?? commentId,
      writerId: row.writerId,
      fromRecipient: [...row.to, ...row.cc, ...row.bcc].some((a) => a.toLowerCase() === from),
    }
  }

  private async resolveReplyContext(
    payload: InboundEmailPayload,
  ): Promise<{ taskId: string; listId: string; commentId?: string | null } | null> {
    const candidates: string[] = []
    if (payload.inReplyTo) candidates.push(payload.inReplyTo.trim())
    if (payload.references) candidates.push(...payload.references.split(/\s+/).map((s) => s.trim()))

    for (const ref of candidates) {
      if (!ref) continue
      // A notification this server sent about a task: what a reply answers.
      const [sent] = await this.db
        .select({ taskId: outboundEmailMessages.taskId, listId: outboundEmailMessages.listId, commentId: outboundEmailMessages.commentId })
        .from(outboundEmailMessages)
        .where(eq(outboundEmailMessages.messageId, ref))
        .limit(1)
      if (sent) return { taskId: sent.taskId, listId: sent.listId, commentId: sent.commentId }
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
    // In any case, as every lookup by email (`found-30-sep/sign-in-reads-the-email-as-typed`).
    const [byEmail] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(sameEmail(users.email, normalized))
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

  /** The sender, when they are somebody who may comment on this task (`taskCommentAllowed`); null otherwise. */
  private async memberWhoMayComment(taskId: string, fromAddress: string): Promise<string | null> {
    const [byEmail] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(sameEmail(users.email, fromAddress))
      .limit(1)
    if (!byEmail) return null
    return (await taskCommentAllowed(this.db, taskId, byEmail.id)) ? byEmail.id : null
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

  /**
   * §V2-08, frame `15:32` — "Send email to task".
   *
   * THE ADDRESS ALREADY WORKED; NOTHING EVER SHOWED IT. `parseRecipient` has
   * routed `list-<localPart>+task-<id>@domain` to a comment on that task since
   * this module was written, and no screen in the product tells anybody the
   * address exists. That is the whole gap: a working inbound path nobody can
   * reach.
   *
   * Composed HERE rather than in the web app, even though the pieces are all in
   * the alias response. The prefix, the `+task-` tag and the domain are this
   * module's protocol, and a client that assembles them itself is a second
   * place the format lives — the next time it changes, one of the two is wrong
   * and the failure is an email silently going nowhere.
   *
   * Null when the list has no alias, rather than a plausible-looking address
   * that bounces.
   */
  async taskEmailAddress(taskId: string): Promise<{ address: string | null; listId: string | null }> {
    const [row] = await this.db
      .select({ listId: tasks.listId })
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1)
    if (!row) throw new NotFoundException('Task not found')
    const alias = await this.liveAlias(row.listId)
    if (!alias || alias.revokedAt) return { address: null, listId: row.listId }
    return { address: taskReplyAddress(alias.localPart, taskId), listId: row.listId }
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
    return {
      id: row.id,
      listId: row.listId,
      localPart: row.localPart,
      address: `${LOCAL_PART_PREFIX}${row.localPart}@${inboundDomain()}`,
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
