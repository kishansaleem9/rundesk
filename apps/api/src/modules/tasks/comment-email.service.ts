import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, isNotNull, or } from 'drizzle-orm'
import {
  customFieldDefinitions,
  customFieldValues,
  outboundEmailMessages,
  taskAttachments,
  taskCommentEmails,
  taskComments,
  tasks,
  users,
  workspaceMembers,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { FLAGS } from '@rundesk/feature-flags'
import { DB_TOKEN } from '../../common/database/database.module'
import { R2Service } from '../../common/storage/r2.service'
import { isUuid } from '../../common/validation/uuid'
import { EmailService, TaskEmailRefused } from '../email/email.service'
import { emailReplyAddress, inboundDomain } from '../email-to-task/task-address'
import { FeatureFlagsService } from '../feature-flags/feature-flags.service'
import { TasksService } from './tasks.service'
import {
  COMMENT_EMAIL_REFUSALS,
  EMAIL_ATTACHMENTS_MAX_BYTES,
  EMAIL_BODY_MAX,
  EMAIL_MAX_RECIPIENTS,
  EMAIL_SUBJECT_MAX,
  emailAddress,
  emailRecipients,
  emailSubject,
  replySubject,
} from './comment-email'

type Actor = { id: string; role?: string | null }

export type SendCommentEmail = {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject?: string
  body: string
  /** An answer, in the thread of this comment: by email to an email it carries the thread on. */
  parentCommentId?: string
  attachmentIds?: string[]
}

/** Why the comment box may not send email here, in the words it shows; null when it may. */
type Refusal = { reason: 'comment' | 'guest' | 'off' | 'unconfigured'; message: string; status: number }

/**
 * A COMMENT SENT AS EMAIL, FROM THE TASK'S COMMENT BOX
 * (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`,
 * `suite-hygiene/task-mentions-pins-unbuilt-email-mode`).
 *
 * ClickUp's Email ClickApp: in a task's comment box, Comment ▾ → Email; To,
 * CC, BCC, a subject, the message and its files; Send. The email stays in the
 * task's activity, and the answers of the people it went to land there too,
 * under it; one that came in by email is answered as a comment or by email.
 * An owner or admin turns the ClickApp on, and guests may not use it ("Use
 * Email in ClickUp", help centre, read through search excerpts, 9 October).
 *
 * WHERE IT DIFFERS: ClickUp sends from a mailbox its user linked (Gmail,
 * Microsoft 365, IMAP), and reads the answers there. Rundesk sends from the
 * server's own address in the writer's name — "Ana via Rundesk" — and the
 * answers come back to an address of the email's own (`emailReplyAddress`),
 * which only its recipients, or members who may comment, may use.
 */
@Injectable()
export class CommentEmailService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly tasks: TasksService,
    private readonly email: EmailService,
    private readonly flags: FeatureFlagsService,
    private readonly r2: R2Service,
  ) {}

  /**
   * In this order, as the composer says it: the task's own comment rule (a
   * reader who may not comment is told so by it), then a guest, then the
   * ClickApp, then whether this server sends mail at all.
   */
  private async gate(taskId: string, actor: Actor): Promise<{ task: { id: string; listId: string; title: string }; refusal: Refusal | null }> {
    const [task] = await this.db.select({ id: tasks.id, listId: tasks.listId, title: tasks.title }).from(tasks).where(eq(tasks.id, taskId)).limit(1)
    if (!task) throw new NotFoundException('Task not found')
    try {
      await this.tasks.assertMayComment(taskId, actor.id)
    } catch (err) {
      if (err instanceof HttpException && err.getStatus() === 403) {
        return { task, refusal: { reason: 'comment', message: String((err.getResponse() as { message?: string })?.message ?? err.message), status: 403 } }
      }
      throw err
    }
    const workspaceId = await this.tasks.workspaceIdForList(task.listId)
    if (!workspaceId) throw new NotFoundException('Task not found')
    const [membership] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actor.id)))
      .limit(1)
    if (membership?.role === 'guest') return { task, refusal: { reason: 'guest', message: COMMENT_EMAIL_REFUSALS.guest, status: 403 } }
    const on = await this.flags.isEnabled(FLAGS.TASK_EMAIL, { workspaceId, userId: actor.id, role: actor.role ?? '' })
    if (!on) return { task, refusal: { reason: 'off', message: COMMENT_EMAIL_REFUSALS.off, status: 403 } }
    if (!this.email.isConfigured()) return { task, refusal: { reason: 'unconfigured', message: COMMENT_EMAIL_REFUSALS.unconfigured, status: 503 } }
    return { task, refusal: null }
  }

  private refuse(refusal: Refusal): never {
    if (refusal.status === 503) throw new ServiceUnavailableException(refusal.message)
    throw new ForbiddenException(refusal.message)
  }

  /** The writer's name on the From line: theirs, else their address's first half. */
  private async writerName(actorId: string): Promise<string> {
    const [me] = await this.db.select({ displayName: users.displayName, email: users.email }).from(users).where(eq(users.id, actorId)).limit(1)
    const name = (me?.displayName ?? '').replace(/[\r\n"<>]+/g, ' ').trim()
    return name || (me?.email ?? 'Somebody').split('@')[0]
  }

  /** What the comment box needs to offer Email: whether it may, and why not in words, and who it goes from. */
  async setup(taskId: string, actor: Actor) {
    const { refusal } = await this.gate(taskId, actor)
    const name = await this.writerName(actor.id)
    return {
      available: refusal === null,
      reason: refusal?.reason ?? null,
      message: refusal?.message ?? null,
      from: { name: `${name} via Rundesk`, address: this.email.senderAddress() },
      limits: { recipients: EMAIL_MAX_RECIPIENTS, subject: EMAIL_SUBJECT_MAX, body: EMAIL_BODY_MAX, attachmentBytes: EMAIL_ATTACHMENTS_MAX_BYTES },
    }
  }

  /**
   * Addresses for the To, CC and BCC boxes, matching `q`: the workspace's
   * members, the people this person has emailed from a task before and who
   * answered on this task (their contacts), and the task's Email fields — as
   * ClickUp suggests a task's Email field and the sender's contacts.
   */
  async suggestions(taskId: string, actor: Actor, q: string) {
    const { refusal } = await this.gate(taskId, actor)
    if (refusal) this.refuse(refusal)
    const [task] = await this.db.select({ listId: tasks.listId }).from(tasks).where(eq(tasks.id, taskId)).limit(1)
    const workspaceId = await this.tasks.workspaceIdForList(task.listId)
    const found = new Map<string, { address: string; name: string | null; source: 'field' | 'contact' | 'member' }>()
    const add = (raw: string | null | undefined, name: string | null, source: 'field' | 'contact' | 'member') => {
      const address = raw ? emailAddress(raw) : null
      if (address && !found.has(address)) found.set(address, { address, name, source })
    }
    // The task's own Email fields first: the address this task is about.
    const fields = await this.db
      .select({ value: customFieldValues.value, name: customFieldDefinitions.name })
      .from(customFieldValues)
      .innerJoin(customFieldDefinitions, eq(customFieldDefinitions.id, customFieldValues.fieldId))
      .where(and(eq(customFieldValues.taskId, taskId), eq(customFieldDefinitions.type, 'email')))
    for (const f of fields) if (typeof f.value?.v === 'string') add(f.value.v, f.name, 'field')
    // Who this person has emailed from any task, most recent first, and who has written in on this one.
    const sent = await this.db
      .select({ to: taskCommentEmails.toAddresses, cc: taskCommentEmails.ccAddresses, bcc: taskCommentEmails.bccAddresses })
      .from(taskCommentEmails)
      .innerJoin(taskComments, eq(taskComments.id, taskCommentEmails.commentId))
      .where(and(eq(taskComments.authorId, actor.id), eq(taskCommentEmails.direction, 'out')))
      .orderBy(desc(taskCommentEmails.createdAt))
      .limit(200)
    const answered = await this.db
      .select({ from: taskCommentEmails.fromAddress })
      .from(taskCommentEmails)
      .innerJoin(taskComments, eq(taskComments.id, taskCommentEmails.commentId))
      .where(and(eq(taskComments.taskId, taskId), eq(taskCommentEmails.direction, 'in')))
    for (const a of answered) add(a.from, null, 'contact')
    for (const s of sent) for (const a of [...s.to, ...s.cc, ...s.bcc]) add(a, null, 'contact')
    if (workspaceId) {
      const members = await this.db
        .select({ email: users.email, name: users.displayName })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), isNotNull(users.email)))
      for (const m of members) add(m.email, m.name ?? null, 'member')
    }
    const needle = q.trim().toLowerCase()
    return [...found.values()]
      .filter((s) => !needle || s.address.includes(needle) || (s.name ?? '').toLowerCase().includes(needle))
      .slice(0, 20)
  }

  async send(taskId: string, actor: Actor, input: SendCommentEmail) {
    const { task, refusal } = await this.gate(taskId, actor)
    if (refusal) this.refuse(refusal)

    const checked = emailRecipients(input)
    if (!checked.ok) throw new BadRequestException(checked.message)
    const { to, cc, bcc } = checked.recipients
    const body = typeof input.body === 'string' ? input.body : ''
    if (body.length > EMAIL_BODY_MAX) throw new BadRequestException(COMMENT_EMAIL_REFUSALS.bodyTooLong)

    // An answer: in the thread of a comment on this task, and by email to an email, carrying its thread on.
    let parentId: string | undefined
    let inReplyTo: string | undefined
    let answered: string | undefined
    if (input.parentCommentId) {
      if (!isUuid(input.parentCommentId)) throw new BadRequestException(COMMENT_EMAIL_REFUSALS.notAReply)
      const [parent] = await this.db
        .select({ id: taskComments.id, parentId: taskComments.parentCommentId })
        .from(taskComments)
        .where(and(eq(taskComments.id, input.parentCommentId), eq(taskComments.taskId, taskId)))
        .limit(1)
      if (!parent) throw new BadRequestException(COMMENT_EMAIL_REFUSALS.notAReply)
      parentId = parent.parentId ?? parent.id
      // The last email of the thread is the one answered: what the other side's client threads on.
      const [last] = await this.db
        .select({ messageId: taskCommentEmails.messageId, subject: taskCommentEmails.subject })
        .from(taskCommentEmails)
        .innerJoin(taskComments, eq(taskComments.id, taskCommentEmails.commentId))
        .where(or(eq(taskComments.id, parentId), eq(taskComments.parentCommentId, parentId)))
        .orderBy(desc(taskCommentEmails.createdAt))
        .limit(1)
      inReplyTo = last?.messageId
      answered = last?.subject
    }
    const subject = emailSubject(input.subject, answered !== undefined ? replySubject(answered || task.title) : task.title)
    if (subject.length > EMAIL_SUBJECT_MAX) throw new BadRequestException(COMMENT_EMAIL_REFUSALS.subjectTooLong)

    // The files go with it: this task's own, read from the store; each id another task's is not one.
    const ids = (input.attachmentIds ?? []).filter((id) => isUuid(id))
    const files = ids.length
      ? await this.db
          .select({ id: taskAttachments.id, fileName: taskAttachments.fileName, contentType: taskAttachments.contentType, storageKey: taskAttachments.storageKey, sizeBytes: taskAttachments.sizeBytes })
          .from(taskAttachments)
          .where(and(eq(taskAttachments.taskId, taskId), inArray(taskAttachments.id, ids)))
      : []
    if (!body.trim() && files.length === 0) throw new BadRequestException(COMMENT_EMAIL_REFUSALS.empty)
    if (files.reduce((sum, f) => sum + Number(f.sizeBytes ?? 0), 0) > EMAIL_ATTACHMENTS_MAX_BYTES) throw new BadRequestException(COMMENT_EMAIL_REFUSALS.filesTooBig)
    if (files.length > 0 && !this.r2.configured) throw new BadRequestException(COMMENT_EMAIL_REFUSALS.noStore)
    const attachments = await Promise.all(
      files.map(async (f) => ({ filename: f.fileName, content: await this.r2.getObject(f.storageKey), contentType: f.contentType || undefined })),
    )
    if (attachments.reduce((sum, a) => sum + a.content.length, 0) > EMAIL_ATTACHMENTS_MAX_BYTES) throw new BadRequestException(COMMENT_EMAIL_REFUSALS.filesTooBig)

    const outboundId = randomUUID()
    const messageId = `<task-email.${outboundId}@${inboundDomain()}>`
    const replyTo = emailReplyAddress(outboundId)
    const fromName = await this.writerName(actor.id)
    try {
      await this.email.sendTaskEmail({ fromName, to, cc, bcc, subject, text: body, replyTo, messageId, inReplyTo, attachments })
    } catch (err) {
      if (err instanceof TaskEmailRefused) throw new BadGatewayException(`The mail server did not take it: ${err.said}`)
      throw err
    }

    // Sent: kept as the task's comment, with its envelope, and the address its answers come back to.
    const comment = await this.tasks.createComment(taskId, actor.id, body, parentId, [], files.map((f) => f.id), {
      email: { direction: 'out', fromAddress: this.email.senderAddress(), toAddresses: to, ccAddresses: cc, bccAddresses: bcc, subject, messageId },
    })
    if (!comment) throw new NotFoundException('Comment not found')
    await this.db.insert(outboundEmailMessages).values({
      id: outboundId,
      messageId,
      taskId,
      listId: task.listId,
      recipient: [...to, ...cc, ...bcc].join(', '),
      replyTo,
      commentId: comment.id,
    })
    return { ...comment, email: { direction: 'out' as const, from: this.email.senderAddress(), to, cc, bcc, subject } }
  }
}
