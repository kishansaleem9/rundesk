import { Injectable, Inject, Logger, NotFoundException, BadRequestException } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { and, asc, eq, isNull, lte } from 'drizzle-orm'
import { reminders, tasks, lists, projects, spaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { NotificationsService } from '../notifications/notifications.service'

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

  async create(workspaceId: string, userId: string, taskId: string, remindAt: Date | string, note?: string) {
    if (!taskId) throw new BadRequestException('taskId is required')
    const when = remindAt instanceof Date ? remindAt : new Date(remindAt)
    if (Number.isNaN(when.getTime())) throw new BadRequestException('remindAt must be a valid date/time')
    // Allow a minute of clock skew, otherwise reminders must be in the future.
    if (when.getTime() <= Date.now() - 60_000) throw new BadRequestException('remindAt must be in the future')

    const task = await this.resolveTask(workspaceId, taskId)
    if (!task) throw new NotFoundException('Task not found in this workspace')

    const trimmedNote = note?.trim() || null
    const [row] = await this.db
      .insert(reminders)
      .values({ workspaceId, userId, taskId, remindAt: when, note: trimmedNote })
      .returning()
    return { ...row, taskTitle: task.title }
  }

  /** The caller's reminders on a task (pending first, then fired), soonest first. */
  async listForTask(taskId: string, userId: string) {
    return this.db
      .select()
      .from(reminders)
      .where(and(eq(reminders.taskId, taskId), eq(reminders.userId, userId)))
      .orderBy(asc(reminders.remindAt))
  }

  /** All of the caller's still-pending reminders in a workspace. */
  async listUpcoming(workspaceId: string, userId: string) {
    return this.db
      .select({
        id: reminders.id,
        taskId: reminders.taskId,
        taskTitle: tasks.title,
        note: reminders.note,
        remindAt: reminders.remindAt,
        notifiedAt: reminders.notifiedAt,
      })
      .from(reminders)
      .innerJoin(tasks, eq(tasks.id, reminders.taskId))
      .where(and(eq(reminders.workspaceId, workspaceId), eq(reminders.userId, userId), isNull(reminders.notifiedAt)))
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
        note: reminders.note,
        taskTitle: tasks.title,
      })
      .from(reminders)
      .innerJoin(tasks, eq(tasks.id, reminders.taskId))
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
