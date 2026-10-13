import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { and, eq, gt, inArray, isNotNull, sql } from 'drizzle-orm'
import { taskCommentEmails, taskComments } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { EmailAccountsService } from '../email-accounts/email-accounts.service'
import { withoutQuote } from '../email-accounts/mail-message'
import type { ThreadMessage } from '../email-accounts/mailbox.client'
import { RealtimeGateway } from '../realtime/realtime.gateway'
import { CommentEmailService } from './comment-email.service'

/**
 * WHAT A TASK'S EMAIL WAITS ON (`found-9-oct/task-email-sends-from-the-server`).
 *
 * The answers to an email sent from a linked mailbox come back to that
 * mailbox, as ClickUp reads them: every `EMAIL_REPLY_POLL_SECONDS` (two
 * minutes; a lane, two seconds) each thread sent from one in the last thirty
 * days is read again, and a message in it that is not the mailbox's own and
 * not yet in the task lands under the email — its words without the quote of
 * what it answers, its sender beside it — once, whichever process read it.
 * And every `TASK_EMAIL_SCHEDULE_SECONDS` (thirty; a lane, one) the emails
 * whose time has come are sent as their writers.
 */
@Injectable()
export class TaskEmailJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(TaskEmailJobsService.name)
  private timers: NodeJS.Timeout[] = []
  private busy = { replies: false, due: false }

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly accounts: EmailAccountsService,
    private readonly emails: CommentEmailService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private static seconds(name: string, fallback: number): number {
    const n = Number(process.env[name])
    return Number.isFinite(n) && n > 0 ? n : fallback
  }

  onModuleInit() {
    const every = (seconds: number, job: 'replies' | 'due', run: () => Promise<unknown>) => {
      const t = setInterval(() => {
        if (this.busy[job]) return
        this.busy[job] = true
        run()
          .catch((err) => this.log.warn(`${job}: ${err instanceof Error ? err.message : String(err)}`))
          .finally(() => (this.busy[job] = false))
      }, seconds * 1000)
      t.unref()
      this.timers.push(t)
    }
    every(TaskEmailJobsService.seconds('EMAIL_REPLY_POLL_SECONDS', 120), 'replies', () => this.readAnswers())
    every(TaskEmailJobsService.seconds('TASK_EMAIL_SCHEDULE_SECONDS', 30), 'due', () => this.emails.sendDue())
  }

  onModuleDestroy() {
    for (const t of this.timers) clearInterval(t)
    this.timers = []
  }

  /** Each recent thread sent from a mailbox, read again; what is new in it lands in its task. Returns how many landed. */
  async readAnswers(): Promise<number> {
    const threads = await this.db
      .selectDistinct({ accountId: taskCommentEmails.accountId, threadId: taskCommentEmails.providerThreadId })
      .from(taskCommentEmails)
      .where(
        and(
          isNotNull(taskCommentEmails.accountId),
          isNotNull(taskCommentEmails.providerThreadId),
          eq(taskCommentEmails.direction, 'out'),
          gt(taskCommentEmails.createdAt, sql`now() - interval '30 days'`),
        ),
      )
      .limit(200)
    // One read of each mailbox, its threads together: an IMAP mailbox is signed in to once a poll, not once a thread.
    const byAccount = new Map<string, string[]>()
    for (const t of threads) {
      if (!t.accountId || !t.threadId) continue
      byAccount.set(t.accountId, [...(byAccount.get(t.accountId) ?? []), t.threadId])
    }
    let landed = 0
    for (const [accountId, threadIds] of byAccount) {
      // What is already in its task is not read again (an IMAP mailbox asks before it fetches a whole message).
      const known = async (ids: string[]) =>
        new Set(
          ids.length
            ? (
                await this.db
                  .select({ id: taskCommentEmails.providerMessageId })
                  .from(taskCommentEmails)
                  .where(and(eq(taskCommentEmails.accountId, accountId), inArray(taskCommentEmails.providerMessageId, ids)))
              ).map((r) => r.id ?? '')
            : [],
        )
      const read = await this.accounts.readThreads(accountId, threadIds, known)
      if (!read) continue
      for (const [threadId, messages] of read.threads) landed += await this.landThread(accountId, read.account.address, threadId, messages)
    }
    return landed
  }

  private async landThread(accountId: string, address: string, threadId: string, messages: ThreadMessage[]): Promise<number> {
    const theirs = messages.filter((m) => m.from && m.from !== address)
    if (theirs.length === 0) return 0
    const known = new Set(
      (
        await this.db
          .select({ id: taskCommentEmails.providerMessageId })
          .from(taskCommentEmails)
          .where(and(eq(taskCommentEmails.accountId, accountId), inArray(taskCommentEmails.providerMessageId, theirs.map((m) => m.providerMessageId))))
      ).map((r) => r.id),
    )
    const fresh = theirs.filter((m) => !known.has(m.providerMessageId))
    if (fresh.length === 0) return 0
    // The thread's first email from the task: its comment is the root the answers go under, and its writer theirs.
    const [root] = await this.db
      .select({ commentId: taskComments.id, parentId: taskComments.parentCommentId, taskId: taskComments.taskId, authorId: taskComments.authorId })
      .from(taskCommentEmails)
      .innerJoin(taskComments, eq(taskComments.id, taskCommentEmails.commentId))
      .where(and(eq(taskCommentEmails.accountId, accountId), eq(taskCommentEmails.providerThreadId, threadId), eq(taskCommentEmails.direction, 'out')))
      .orderBy(taskCommentEmails.createdAt)
      .limit(1)
    if (!root) return 0
    const rootId = root.parentId ?? root.commentId
    let landed = 0
    for (const m of fresh) {
      try {
        const comment = await this.db.transaction(async (tx) => {
          const [c] = await tx
            .insert(taskComments)
            .values({ taskId: root.taskId, authorId: root.authorId, body: withoutQuote(m.text) || '(empty reply)', channel: 'email', parentCommentId: rootId })
            .returning()
          // Once: a second reader of the same message is refused here, and its comment goes with it.
          await tx.insert(taskCommentEmails).values({
            commentId: c.id,
            direction: 'in',
            fromAddress: m.from ?? '',
            toAddresses: m.to,
            subject: m.subject,
            messageId: m.internetMessageId ?? `<${m.providerMessageId}@mailbox.${accountId}>`,
            accountId,
            providerThreadId: threadId,
            providerMessageId: m.providerMessageId,
          })
          return c
        })
        landed += 1
        this.realtime.emitToTask(root.taskId, { type: 'comment.created', taskId: root.taskId, comment: { id: comment.id, body: comment.body } })
      } catch (err) {
        // Read and written by another process first: nothing to add.
        const code = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code
        if (code !== '23505') throw err
      }
    }
    return landed
  }
}
