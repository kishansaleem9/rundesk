import { Injectable, Inject, Logger, NotFoundException, BadRequestException } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { and, asc, eq, isNull, lte } from 'drizzle-orm'
import { reminders, tasks, lists, projects, spaces, chatMessages, chatChannels } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { NotificationsService } from '../notifications/notifications.service'
import { readableTask, type ReadActor } from '../../common/permissions/read-access'

/**
 * User-created task reminders (Plan §4/§10). Users pin an arbitrary "remind me
 * at <time>" on a task; a minute tick fires each due reminder exactly once
 * through the notification pipeline. Separate from the automated
 * due-soon/overdue RemindersService in the notifications module.
 */
@Injectable()
export class TaskRemindersService {
  private readonly logger = new Logger(TaskRemindersService.name)

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private notifications: NotificationsService,
  ) {}

  /** Resolve a task's title + workspace, asserting it lives in this workspace. */
  private async resolveTask(workspaceId: string, taskId: string) {
    const [row] = await this.db
      .select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(and(eq(tasks.id, taskId), eq(spaces.workspaceId, workspaceId)))
      .limit(1)
    return row ?? null
  }

  /** Shared validation: a reminder has to be for a real, future moment. */
  private parseWhen(remindAt: Date | string): Date {
    const when = remindAt instanceof Date ? remindAt : new Date(remindAt)
    if (Number.isNaN(when.getTime())) throw new BadRequestException('remindAt must be a valid date/time')
    // Allow a minute of clock skew, otherwise reminders must be in the future.
    if (when.getTime() <= Date.now() - 60_000) throw new BadRequestException('remindAt must be in the future')
    return when
  }

  async create(workspaceId: string, actor: ReadActor, taskId: string, remindAt: Date | string, note?: string) {
    if (!taskId) throw new BadRequestException('taskId is required')
    const when = this.parseWhen(remindAt)
    const userId = actor.id

    const task = await this.resolveTask(workspaceId, taskId)
    // A reminder is about a task its maker may read: the answer carries the
    // title, and so does the notification it becomes. A member refused a
    // private space was told a task's title there (`found-25-sep/task-rows-changed-by-id-anywhere`).
    if (!task || !(await readableTask(this.db, workspaceId, taskId, actor))) throw new NotFoundException('Task not found in this workspace')

    const trimmedNote = note?.trim() || null
    const [row] = await this.db
      .insert(reminders)
      .values({ workspaceId, userId, taskId, remindAt: when, note: trimmedNote })
      .returning()
    return { ...row, taskTitle: task.title }
  }

  /**
   * §G11 [15:19] — a reminder about a chat message.
   *
   * Access is the caller's problem to have established before getting here;
   * ChatService checks the channel and then calls this. What this owns is that
   * the row points at the message, so the notification lands you back on the
   * line you wanted to remember.
   */
  async createForMessage(
    workspaceId: string,
    userId: string,
    messageId: string,
    remindAt: Date | string,
    note?: string,
  ) {
    if (!messageId) throw new BadRequestException('messageId is required')
    const when = this.parseWhen(remindAt)
    const [row] = await this.db
      .insert(reminders)
      .values({ workspaceId, userId, messageId, remindAt: when, note: note?.trim() || null })
      .returning()
    return row
  }

  /**
   * A reminder about nothing in particular — just a note and a time.
   *
   * This is what `/remind in 2 hours call Ali` should always have been. It used
   * to fabricate a task to hold the text, which left a phantom task in the list
   * for every egg-timer anybody set, and refused outright in a workspace with
   * no list yet.
   */
  async createStandalone(workspaceId: string, userId: string, remindAt: Date | string, note: string) {
    const trimmedNote = note?.trim()
    if (!trimmedNote) throw new BadRequestException('A reminder needs something to say')
    const when = this.parseWhen(remindAt)
    const [row] = await this.db
      .insert(reminders)
      .values({ workspaceId, userId, remindAt: when, note: trimmedNote })
      .returning()
    return row
  }

  /** The caller's reminders on a task (pending first, then fired), soonest first. */
  async listForTask(taskId: string, userId: string) {
    return this.db
      .select()
      .from(reminders)
      .where(and(eq(reminders.taskId, taskId), eq(reminders.userId, userId)))
      .orderBy(asc(reminders.remindAt))
  }

  /**
   * All of the caller's still-pending reminders in a workspace.
   *
   * LEFT joins, not inner. An inner join on `tasks` was correct only while
   * every reminder had a task; the moment one could be about a message or
   * about nothing, an inner join stops being a join and starts being a filter
   * that hides rows the user created and can see no reason for.
   */
  async listUpcoming(workspaceId: string, userId: string) {
    return this.db
      .select({
        id: reminders.id,
        taskId: reminders.taskId,
        taskTitle: tasks.title,
        messageId: reminders.messageId,
        messageBody: chatMessages.body,
        channelId: chatMessages.channelId,
        channelName: chatChannels.name,
        note: reminders.note,
        remindAt: reminders.remindAt,
        notifiedAt: reminders.notifiedAt,
      })
      .from(reminders)
      .leftJoin(tasks, eq(tasks.id, reminders.taskId))
      .leftJoin(chatMessages, eq(chatMessages.id, reminders.messageId))
      .leftJoin(chatChannels, eq(chatChannels.id, chatMessages.channelId))
      .where(and(eq(reminders.workspaceId, workspaceId), eq(reminders.userId, userId), isNull(reminders.notifiedAt)))
      .orderBy(asc(reminders.remindAt))
  }

  /** The caller's reminders about one chat message, soonest first. */
  async listForMessage(messageId: string, userId: string) {
    return this.db
      .select()
      .from(reminders)
      .where(and(eq(reminders.messageId, messageId), eq(reminders.userId, userId)))
      .orderBy(asc(reminders.remindAt))
  }

  async remove(id: string, userId: string) {
    const [row] = await this.db
      .delete(reminders)
      .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
      .returning({ id: reminders.id })
    if (!row) throw new NotFoundException('Reminder not found')
    return { ok: true }
  }

  /**
   * Fire every reminder that's due and not yet fired. Each row is claimed with a
   * conditional UPDATE (notified_at IS NULL) so a reminder can never double-fire,
   * even if two ticks overlap. Returns the number fired. Public so the tick — and
   * tests — can invoke it directly.
   */
  async processDue(now: Date = new Date()): Promise<number> {
    const due = await this.db
      .select({
        id: reminders.id,
        userId: reminders.userId,
        workspaceId: reminders.workspaceId,
        taskId: reminders.taskId,
        messageId: reminders.messageId,
        note: reminders.note,
        taskTitle: tasks.title,
        messageBody: chatMessages.body,
        channelId: chatMessages.channelId,
      })
      .from(reminders)
      // LEFT, for the reason listUpcoming gives: an inner join here would let
      // every message and standalone reminder come due and never fire, with
      // nothing anywhere saying why.
      .leftJoin(tasks, eq(tasks.id, reminders.taskId))
      .leftJoin(chatMessages, eq(chatMessages.id, reminders.messageId))
      .where(and(isNull(reminders.notifiedAt), lte(reminders.remindAt, now)))

    let fired = 0
    for (const r of due) {
      // Claim the row; only the tick that flips notified_at sends the notification.
      const claimed = await this.db
        .update(reminders)
        .set({ notifiedAt: now })
        .where(and(eq(reminders.id, r.id), isNull(reminders.notifiedAt)))
        .returning({ id: reminders.id })
      if (claimed.length === 0) continue

      fired++
      // Three subjects, three destinations. A reminder that fires and lands
      // nowhere is worse than one that never fires — it interrupts you and
      // then refuses to say what about.
      if (r.messageId && r.channelId) {
        void this.notifications.create({
          userId: r.userId,
          workspaceId: r.workspaceId,
          type: 'message_reminder',
          title: r.note ? `Reminder: ${r.note}` : 'Reminder about a message',
          body: (r.messageBody ?? '').slice(0, 180) || undefined,
          target: {
            entityType: 'chat_message',
            entityId: r.messageId,
            url: `/app/${r.workspaceId}/chat?channel=${r.channelId}&message=${r.messageId}`,
          },
          emailContext: { commentSnippet: (r.messageBody ?? '').slice(0, 180) },
        })
      } else if (r.taskId && r.taskTitle) {
        void this.notifications.create({
          userId: r.userId,
          workspaceId: r.workspaceId,
          type: 'task_due_soon',
          title: `Reminder: "${r.taskTitle}"`,
          body: r.note ?? undefined,
          target: {
            entityType: 'task',
            entityId: r.taskId,
            url: `/app/${r.workspaceId}/tasks/${r.taskId}`,
          },
          emailContext: { taskTitle: r.taskTitle },
        })
      } else {
        // A note and a time, with nothing to open. It still has to arrive.
        void this.notifications.create({
          userId: r.userId,
          workspaceId: r.workspaceId,
          type: 'message_reminder',
          title: `Reminder: ${r.note ?? 'you asked to be reminded'}`,
          target: { entityType: 'insights', entityId: r.workspaceId, url: `/app/${r.workspaceId}/inbox` },
        })
      }
    }
    return fired
  }

  /** Minute tick — fire any reminders that have come due. */
  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    try {
      const fired = await this.processDue()
      if (fired > 0) this.logger.log(`Fired ${fired} reminder(s)`)
    } catch (err) {
      this.logger.error('Reminder tick failed', err as Error)
    }
  }
}
