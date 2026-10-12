import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm'
import {
  customFieldDefinitions,
  customFieldValues,
  outboundEmailMessages,
  scheduledTaskEmails,
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
import { EmailAccountsService } from '../email-accounts/email-accounts.service'
import { EMAIL_PLAN_REFUSALS } from '../email-accounts/email-plan'
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
  SCHEDULE_REFUSALS,
  scheduleTime,
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
  /** A mailbox the writer linked, or may send from (`found-9-oct/task-email-sends-from-the-server`); none: the server's own address. */
  accountId?: string
  /** A time to send it at, later: kept until then (Pro and above). */
  sendAt?: string
}

/** Why the comment box may not send email here, in the words it shows; null when it may. */
type Refusal = { reason: 'comment' | 'guest' | 'off' | 'unconfigured'; message: string; status: number }

/**
 * A COMMENT SENT AS EMAIL, FROM THE TASK'S COMMENT BOX
 * (`resume-defects/s4-composer-email`, `ledger-rows/row-1252`,
 * `suite-hygiene/task-mentions-pins-unbuilt-email-mode`).
 *
 * ClickUp's Email ClickApp: in a task's comment box, Comment ▾ → Email; From,
 * To, CC, BCC, a subject, the message and its files; Send. The email stays in
 * the task's activity, and the answers of the people it went to land there
 * too, under it; one that came in by email is answered as a comment or by
 * email. An owner or admin turns the ClickApp on, and guests may not use it
 * ("Use Email in ClickUp", help centre, read through search excerpts, 9 October).
 *
 * FROM A MAILBOX OF THE WRITER'S OWN (`found-9-oct/task-email-sends-from-the-server`):
 * ClickUp sends from an email account its user linked — Gmail or Outlook —
 * and reads the answers there; a teammate it is shared with sends from it too.
 * So does this: `accountId` names the mailbox, the provider sends it, and
 * `TaskEmailJobsService` reads the thread's answers back into the task. A send
 * time keeps it until then (`scheduled_task_emails`). With no mailbox chosen
 * it goes from the server's own address in the writer's name — "Ana via
 * Rundesk" — and its answers come back to an address of the email's own
 * (`emailReplyAddress`): where Rundesk differs, so a workspace that links no
 * mailbox still sends.
 */
@Injectable()
export class CommentEmailService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly tasks: TasksService,
    private readonly email: EmailService,
    private readonly flags: FeatureFlagsService,
    private readonly r2: R2Service,
    private readonly accounts: EmailAccountsService,
  ) {}

  /**
   * In this order, as the composer says it: the task's own comment rule (a
   * reader who may not comment is told so by it), then a guest, then the
   * ClickApp. Whether anything can send it — the server's mail, or a mailbox —
   * is asked where it is chosen.
   */
  private async gate(taskId: string, actor: Actor): Promise<{ task: { id: string; listId: string; title: string }; workspaceId: string; refusal: Refusal | null }> {
    const [task] = await this.db.select({ id: tasks.id, listId: tasks.listId, title: tasks.title }).from(tasks).where(eq(tasks.id, taskId)).limit(1)
    if (!task) throw new NotFoundException('Task not found')
    const workspaceId = await this.tasks.workspaceIdForList(task.listId)
    if (!workspaceId) throw new NotFoundException('Task not found')
    try {
      await this.tasks.assertMayComment(taskId, actor.id)
    } catch (err) {
      if (err instanceof HttpException && err.getStatus() === 403) {
        return { task, workspaceId, refusal: { reason: 'comment', message: String((err.getResponse() as { message?: string })?.message ?? err.message), status: 403 } }
      }
      throw err
    }
    const [membership] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, actor.id)))
      .limit(1)
    if (membership?.role === 'guest') return { task, workspaceId, refusal: { reason: 'guest', message: COMMENT_EMAIL_REFUSALS.guest, status: 403 } }
    const on = await this.flags.isEnabled(FLAGS.TASK_EMAIL, { workspaceId, userId: actor.id, role: actor.role ?? '' })
    if (!on) return { task, workspaceId, refusal: { reason: 'off', message: COMMENT_EMAIL_REFUSALS.off, status: 403 } }
    return { task, workspaceId, refusal: null }
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

  /**
   * What the comment box needs to offer Email: whether it may, and why not in
   * words; who it can go from — the mailboxes this person may send from, and
   * the server's address when it sends mail; their signatures and templates;
   * and what the plan gives.
   */
  async setup(taskId: string, actor: Actor) {
    const { workspaceId, refusal } = await this.gate(taskId, actor)
    const name = await this.writerName(actor.id)
    const server = this.email.isConfigured() ? { name: `${name} via Rundesk`, address: this.email.senderAddress() } : null
    const composer = refusal ? null : await this.accounts.composerSetup(workspaceId, actor)
    const linkable = !!composer && (composer.providers.gmail.available || composer.providers.outlook.available)
    const nothingSends = !refusal && !server && (composer?.accounts.length ?? 0) === 0 && !linkable
    const why: Refusal | null = refusal ?? (nothingSends ? { reason: 'unconfigured', message: COMMENT_EMAIL_REFUSALS.unconfigured, status: 503 } : null)
    return {
      available: why === null,
      reason: why?.reason ?? null,
      message: why?.message ?? null,
      // The server's own address, "<writer> via Rundesk"; the mailboxes are `accounts`.
      from: server ?? { name, address: '' },
      server,
      accounts: composer?.accounts ?? [],
      providers: composer?.providers ?? null,
      plan: composer?.plan ?? null,
      signatures: composer?.signatures ?? [],
      templates: composer?.templates ?? [],
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
    const { workspaceId, refusal } = await this.gate(taskId, actor)
    if (refusal) this.refuse(refusal)
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
    const members = await this.db
      .select({ email: users.email, name: users.displayName })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), isNotNull(users.email)))
    for (const m of members) add(m.email, m.name ?? null, 'member')
    const needle = q.trim().toLowerCase()
    return [...found.values()]
      .filter((s) => !needle || s.address.includes(needle) || (s.name ?? '').toLowerCase().includes(needle))
      .slice(0, 20)
  }

  /**
   * Everything an email is checked for before it goes, now or later: its
   * people, its words, its subject, the comment it answers and the files it
   * carries — read from this task, and from the store.
   */
  private async prepare(task: { id: string; title: string }, input: SendCommentEmail) {
    const checked = emailRecipients(input)
    if (!checked.ok) throw new BadRequestException(checked.message)
    const { to, cc, bcc } = checked.recipients
    const body = typeof input.body === 'string' ? input.body : ''
    if (body.length > EMAIL_BODY_MAX) throw new BadRequestException(COMMENT_EMAIL_REFUSALS.bodyTooLong)

    // An answer: in the thread of a comment on this task, and by email to an email, carrying its thread on.
    let parentId: string | undefined
    let last: { messageId: string; subject: string; accountId: string | null; providerThreadId: string | null; providerMessageId: string | null } | undefined
    if (input.parentCommentId) {
      if (!isUuid(input.parentCommentId)) throw new BadRequestException(COMMENT_EMAIL_REFUSALS.notAReply)
      const [parent] = await this.db
        .select({ id: taskComments.id, parentId: taskComments.parentCommentId })
        .from(taskComments)
        .where(and(eq(taskComments.id, input.parentCommentId), eq(taskComments.taskId, task.id)))
        .limit(1)
      if (!parent) throw new BadRequestException(COMMENT_EMAIL_REFUSALS.notAReply)
      parentId = parent.parentId ?? parent.id
      // The last email of the thread is the one answered: what the other side's client threads on.
      ;[last] = await this.db
        .select({
          messageId: taskCommentEmails.messageId,
          subject: taskCommentEmails.subject,
          accountId: taskCommentEmails.accountId,
          providerThreadId: taskCommentEmails.providerThreadId,
          providerMessageId: taskCommentEmails.providerMessageId,
        })
        .from(taskCommentEmails)
        .innerJoin(taskComments, eq(taskComments.id, taskCommentEmails.commentId))
        .where(or(eq(taskComments.id, parentId), eq(taskComments.parentCommentId, parentId)))
        .orderBy(desc(taskCommentEmails.createdAt))
        .limit(1)
    }
    const subject = emailSubject(input.subject, last !== undefined ? replySubject(last.subject || task.title) : task.title)
    if (subject.length > EMAIL_SUBJECT_MAX) throw new BadRequestException(COMMENT_EMAIL_REFUSALS.subjectTooLong)

    // The files go with it: this task's own; each id another task's is not one.
    const ids = (input.attachmentIds ?? []).filter((id) => isUuid(id))
    const files = ids.length
      ? await this.db
          .select({ id: taskAttachments.id, fileName: taskAttachments.fileName, contentType: taskAttachments.contentType, storageKey: taskAttachments.storageKey, sizeBytes: taskAttachments.sizeBytes })
          .from(taskAttachments)
          .where(and(eq(taskAttachments.taskId, task.id), inArray(taskAttachments.id, ids)))
      : []
    if (!body.trim() && files.length === 0) throw new BadRequestException(COMMENT_EMAIL_REFUSALS.empty)
    if (files.reduce((sum, f) => sum + Number(f.sizeBytes ?? 0), 0) > EMAIL_ATTACHMENTS_MAX_BYTES) throw new BadRequestException(COMMENT_EMAIL_REFUSALS.filesTooBig)
    if (files.length > 0 && !this.r2.configured) throw new BadRequestException(COMMENT_EMAIL_REFUSALS.noStore)
    return { to, cc, bcc, body, subject, parentId, last, files }
  }

  private async readFiles(files: Array<{ fileName: string; contentType: string | null; storageKey: string }>) {
    const attachments = await Promise.all(
      files.map(async (f) => ({ filename: f.fileName, content: await this.r2.getObject(f.storageKey), contentType: f.contentType || undefined })),
    )
    if (attachments.reduce((sum, a) => sum + a.content.length, 0) > EMAIL_ATTACHMENTS_MAX_BYTES) throw new BadRequestException(COMMENT_EMAIL_REFUSALS.filesTooBig)
    return attachments
  }

  async send(taskId: string, actor: Actor, input: SendCommentEmail) {
    const { task, workspaceId, refusal } = await this.gate(taskId, actor)
    if (refusal) this.refuse(refusal)
    const accountId = typeof input.accountId === 'string' && input.accountId ? input.accountId : null
    const prepared = await this.prepare(task, input)

    // LATER: kept until its time, and sent then as its writer — asked again whether they still may.
    if (input.sendAt !== undefined && input.sendAt !== null && input.sendAt !== '') {
      const at = scheduleTime(input.sendAt)
      if (!at) throw new BadRequestException(SCHEDULE_REFUSALS.when)
      const { planLabel, email } = await this.accounts.gate(workspaceId, actor)
      if (!email.scheduling) throw new ForbiddenException(EMAIL_PLAN_REFUSALS.scheduling(planLabel))
      if (accountId) {
        const mine = await this.accounts.sendable(workspaceId, actor)
        if (!mine.some((a) => a.id === accountId)) throw new ForbiddenException('You may not send from this email account: whoever linked it chooses who may')
      } else if (!this.email.isConfigured()) {
        throw new ServiceUnavailableException(COMMENT_EMAIL_REFUSALS.unconfigured)
      }
      const [row] = await this.db
        .insert(scheduledTaskEmails)
        .values({
          taskId,
          authorId: actor.id,
          accountId,
          toAddresses: prepared.to,
          ccAddresses: prepared.cc,
          bccAddresses: prepared.bcc,
          subject: typeof input.subject === 'string' && input.subject.trim() ? input.subject : null,
          body: prepared.body,
          attachmentIds: prepared.files.map((f) => f.id),
          parentCommentId: input.parentCommentId && isUuid(input.parentCommentId) ? input.parentCommentId : null,
          sendAt: at,
        })
        .returning()
      return { scheduled: this.scheduledView(row) }
    }

    return this.deliver(task, workspaceId, actor, prepared, accountId)
  }

  /** Sent now: from the mailbox chosen, or from the server's address; then kept as the task's email comment. */
  private async deliver(
    task: { id: string; listId: string; title: string },
    workspaceId: string,
    actor: Actor,
    p: Awaited<ReturnType<CommentEmailService['prepare']>>,
    accountId: string | null,
  ) {
    const attachments = await this.readFiles(p.files)

    if (accountId) {
      // The answered email's thread, when it was sent or read from this very mailbox; its Message-ID either way.
      const answering = p.last
        ? p.last.accountId === accountId && p.last.providerThreadId
          ? { threadId: p.last.providerThreadId, providerMessageId: p.last.providerMessageId, internetMessageId: p.last.messageId }
          : { threadId: '', providerMessageId: null, internetMessageId: p.last.messageId }
        : null
      const { account, sent } = await this.accounts.sendAs(workspaceId, accountId, actor, { to: p.to, cc: p.cc, bcc: p.bcc, subject: p.subject, text: p.body, attachments }, answering)
      const comment = await this.tasks.createComment(task.id, actor.id, p.body, p.parentId, [], p.files.map((f) => f.id), {
        email: {
          direction: 'out',
          fromAddress: account.address,
          toAddresses: p.to,
          ccAddresses: p.cc,
          bccAddresses: p.bcc,
          subject: p.subject,
          messageId: sent.internetMessageId ?? `<${sent.providerMessageId}@mailbox.${account.id}>`,
          accountId: account.id,
          providerThreadId: sent.threadId,
          providerMessageId: sent.providerMessageId,
        },
      })
      if (!comment) throw new NotFoundException('Comment not found')
      return {
        ...comment,
        email: { direction: 'out' as const, from: account.address, to: p.to, cc: p.cc, bcc: p.bcc, subject: p.subject, viaMailbox: true },
      }
    }

    if (!this.email.isConfigured()) throw new ServiceUnavailableException(COMMENT_EMAIL_REFUSALS.unconfigured)
    const outboundId = randomUUID()
    const messageId = `<task-email.${outboundId}@${inboundDomain()}>`
    const replyTo = emailReplyAddress(outboundId)
    const fromName = await this.writerName(actor.id)
    try {
      await this.email.sendTaskEmail({ fromName, to: p.to, cc: p.cc, bcc: p.bcc, subject: p.subject, text: p.body, replyTo, messageId, inReplyTo: p.last?.messageId, attachments })
    } catch (err) {
      if (err instanceof TaskEmailRefused) throw new BadGatewayException(`The mail server did not take it: ${err.said}`)
      throw err
    }

    // Sent: kept as the task's comment, with its envelope, and the address its answers come back to.
    const comment = await this.tasks.createComment(task.id, actor.id, p.body, p.parentId, [], p.files.map((f) => f.id), {
      email: { direction: 'out', fromAddress: this.email.senderAddress(), toAddresses: p.to, ccAddresses: p.cc, bccAddresses: p.bcc, subject: p.subject, messageId },
    })
    if (!comment) throw new NotFoundException('Comment not found')
    await this.db.insert(outboundEmailMessages).values({
      id: outboundId,
      messageId,
      taskId: task.id,
      listId: task.listId,
      recipient: [...p.to, ...p.cc, ...p.bcc].join(', '),
      replyTo,
      commentId: comment.id,
    })
    return { ...comment, email: { direction: 'out' as const, from: this.email.senderAddress(), to: p.to, cc: p.cc, bcc: p.bcc, subject: p.subject, viaMailbox: false } }
  }

  // ── later: the emails set to send at a time ──────────────────────────────────

  private scheduledView(row: typeof scheduledTaskEmails.$inferSelect) {
    return {
      id: row.id,
      sendAt: row.sendAt,
      status: row.status,
      error: row.error,
      accountId: row.accountId,
      to: row.toAddresses,
      cc: row.ccAddresses,
      bcc: row.bccAddresses,
      subject: row.subject,
      body: row.body,
      parentCommentId: row.parentCommentId,
    }
  }

  /** This person's emails waiting on this task — and any that could not go, with why. ClickUp shows them on the task. */
  async scheduled(taskId: string, actor: Actor) {
    const { refusal } = await this.gate(taskId, actor)
    if (refusal && refusal.reason !== 'off') this.refuse(refusal)
    const rows = await this.db
      .select()
      .from(scheduledTaskEmails)
      .where(and(eq(scheduledTaskEmails.taskId, taskId), eq(scheduledTaskEmails.authorId, actor.id), inArray(scheduledTaskEmails.status, ['scheduled', 'sending', 'failed'])))
      .orderBy(asc(scheduledTaskEmails.sendAt))
    return rows.map((r) => this.scheduledView(r))
  }

  private async ownScheduled(taskId: string, actor: Actor, id: string) {
    if (!isUuid(id)) throw new NotFoundException(SCHEDULE_REFUSALS.notFound)
    const [row] = await this.db
      .select()
      .from(scheduledTaskEmails)
      .where(and(eq(scheduledTaskEmails.id, id), eq(scheduledTaskEmails.taskId, taskId), eq(scheduledTaskEmails.authorId, actor.id)))
      .limit(1)
    if (!row) throw new NotFoundException(SCHEDULE_REFUSALS.notFound)
    return row
  }

  /** Moved to another time, while it waits. */
  async reschedule(taskId: string, actor: Actor, id: string, sendAt: unknown) {
    const row = await this.ownScheduled(taskId, actor, id)
    const at = scheduleTime(sendAt)
    if (!at) throw new BadRequestException(SCHEDULE_REFUSALS.when)
    const [moved] = await this.db
      .update(scheduledTaskEmails)
      .set({ sendAt: at, updatedAt: new Date() })
      .where(and(eq(scheduledTaskEmails.id, row.id), eq(scheduledTaskEmails.status, 'scheduled')))
      .returning()
    if (!moved) throw new ConflictException(SCHEDULE_REFUSALS.notScheduled)
    return this.scheduledView(moved)
  }

  /** Cancelled while it waits — or a failed one put away; nothing is sent. */
  async cancelScheduled(taskId: string, actor: Actor, id: string) {
    const row = await this.ownScheduled(taskId, actor, id)
    const [gone] = await this.db
      .update(scheduledTaskEmails)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(scheduledTaskEmails.id, row.id), inArray(scheduledTaskEmails.status, ['scheduled', 'failed'])))
      .returning()
    if (!gone) throw new ConflictException(SCHEDULE_REFUSALS.notScheduled)
    return this.scheduledView(gone)
  }

  /** Sent now rather than at its time. */
  async sendScheduledNow(taskId: string, actor: Actor, id: string) {
    const row = await this.ownScheduled(taskId, actor, id)
    const [claimed] = await this.db
      .update(scheduledTaskEmails)
      .set({ status: 'sending', updatedAt: new Date() })
      .where(and(eq(scheduledTaskEmails.id, row.id), eq(scheduledTaskEmails.status, 'scheduled')))
      .returning()
    if (!claimed) throw new ConflictException(SCHEDULE_REFUSALS.notScheduled)
    const out = await this.sendClaimed(claimed)
    if ('error' in out) throw out.error
    return out.comment
  }

  /** The emails whose time has come, each claimed once, then sent as their writer. */
  async sendDue(limit = 20): Promise<number> {
    const due = await this.db
      .update(scheduledTaskEmails)
      .set({ status: 'sending', updatedAt: new Date() })
      .where(
        inArray(
          scheduledTaskEmails.id,
          sql`(select id from ${scheduledTaskEmails} where ${scheduledTaskEmails.status} = 'scheduled' and ${scheduledTaskEmails.sendAt} <= now() order by ${scheduledTaskEmails.sendAt} limit ${limit} for update skip locked)`,
        ),
      )
      .returning()
    for (const row of due) await this.sendClaimed(row)
    return due.length
  }

  /** One claimed email sent — all of it checked again as its writer now — and marked sent, or failed with why. */
  private async sendClaimed(row: typeof scheduledTaskEmails.$inferSelect): Promise<{ comment: unknown } | { error: Error }> {
    try {
      const [author] = await this.db.select({ id: users.id }).from(users).where(eq(users.id, row.authorId)).limit(1)
      if (!author) throw new ForbiddenException('Its writer is gone')
      const comment = (await this.send(row.taskId, { id: row.authorId }, {
        to: row.toAddresses,
        cc: row.ccAddresses,
        bcc: row.bccAddresses,
        subject: row.subject ?? undefined,
        body: row.body,
        parentCommentId: row.parentCommentId ?? undefined,
        attachmentIds: row.attachmentIds,
        accountId: row.accountId ?? undefined,
      })) as { id?: string }
      await this.db
        .update(scheduledTaskEmails)
        .set({ status: 'sent', commentId: comment?.id ?? null, error: null, updatedAt: new Date() })
        .where(eq(scheduledTaskEmails.id, row.id))
      return { comment }
    } catch (err) {
      const said = err instanceof HttpException ? String((err.getResponse() as { message?: string })?.message ?? err.message) : err instanceof Error ? err.message : String(err)
      await this.db
        .update(scheduledTaskEmails)
        .set({ status: 'failed', error: said.slice(0, 500), updatedAt: new Date() })
        .where(eq(scheduledTaskEmails.id, row.id))
      return { error: err instanceof Error ? err : new Error(said) }
    }
  }
}
