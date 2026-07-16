import { Injectable, Inject, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { and, eq, gte, lte, isNull, sql } from 'drizzle-orm'
import { tasks, taskAssignees, users, lists, projects, spaces, workspaces, timeEntries } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import {
  NotificationsService,
  ALLOWED_REMINDER_LEAD_DAYS,
  normalizeReminderLeadDays,
  reminderLeadLabel,
} from './notifications.service'

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name)

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private notifications: NotificationsService,
  ) {}

  /**
   * Runs every day at 8 AM UTC.
   * Sends due-soon reminders at each user's configured lead days (§10.4 —
   * default [1, 2], optionally 7) and overdue notifications.
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async sendDueDateReminders() {
    this.logger.log('Running due-date reminder job')
    try {
      const now = new Date()
      const today = new Date(now)
      today.setHours(0, 0, 0, 0)

      // Widest lead window any user can configure (currently 7 days). Fetch
      // every due-soon task in this window once, then decide per-assignee based
      // on that user's configured lead days.
      const maxLeadDays = Math.max(...ALLOWED_REMINDER_LEAD_DAYS)
      const windowEnd = new Date(today)
      windowEnd.setDate(windowEnd.getDate() + maxLeadDays)
      windowEnd.setHours(23, 59, 59, 999)

      // Find tasks due within the widest lead window that aren't done/cancelled,
      // joined with each assignee's notification preferences.
      const dueSoonRows = await this.db
        .select({
          taskId: tasks.id,
          taskTitle: tasks.title,
          dueDate: tasks.dueDate,
          assigneeId: taskAssignees.userId,
          prefs: users.notificationPreferences,
          workspaceId: spaces.workspaceId,
          workspaceName: workspaces.name,
        })
        .from(tasks)
        .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
        .innerJoin(users, eq(users.id, taskAssignees.userId))
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .innerJoin(workspaces, eq(workspaces.id, spaces.workspaceId))
        .where(
          and(
            eq(tasks.isArchived, false),
            gte(tasks.dueDate, today),
            lte(tasks.dueDate, windowEnd),
            // Exclude done and cancelled
            sql`${tasks.status} NOT IN ('done', 'cancelled')`,
          ),
        )

      let dueSoonSent = 0
      for (const row of dueSoonRows) {
        if (!row.dueDate) continue

        const dueDay = new Date(row.dueDate)
        dueDay.setHours(0, 0, 0, 0)
        // Whole calendar days from today to the due date (0 = today, 1 = tomorrow).
        const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000)

        // This assignee's configured lead days (default [1, 2] when unset).
        const leadDays = normalizeReminderLeadDays(
          (row.prefs as { reminderLeadDays?: unknown } | null)?.reminderLeadDays,
        )
        if (!leadDays.includes(diffDays)) continue

        const dueDateLabel = reminderLeadLabel(diffDays)
        dueSoonSent += 1

        void this.notifications.create({
          userId: row.assigneeId,
          workspaceId: row.workspaceId,
          type: 'task_due_soon',
          title: `Task due ${dueDateLabel}: "${row.taskTitle}"`,
          target: {
            entityType: 'task',
            entityId: row.taskId,
            url: `/app/${row.workspaceId}/tasks/${row.taskId}`,
          },
          emailContext: {
            taskTitle: row.taskTitle,
            workspaceName: row.workspaceName,
            dueDateLabel,
          },
        })
      }

      // Overdue tasks (due before today, not done/cancelled)
      const overdueRows = await this.db
        .select({
          taskId: tasks.id,
          taskTitle: tasks.title,
          assigneeId: taskAssignees.userId,
          workspaceId: spaces.workspaceId,
          workspaceName: workspaces.name,
        })
        .from(tasks)
        .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .innerJoin(workspaces, eq(workspaces.id, spaces.workspaceId))
        .where(
          and(
            eq(tasks.isArchived, false),
            lte(tasks.dueDate, today),
            sql`${tasks.status} NOT IN ('done', 'cancelled')`,
          ),
        )

      for (const row of overdueRows) {
        void this.notifications.create({
          userId: row.assigneeId,
          workspaceId: row.workspaceId,
          type: 'task_overdue',
          title: `Overdue task: "${row.taskTitle}"`,
          target: {
            entityType: 'task',
            entityId: row.taskId,
            url: `/app/${row.workspaceId}/tasks/${row.taskId}`,
          },
          emailContext: {
            taskTitle: row.taskTitle,
            workspaceName: row.workspaceName,
          },
        })
      }

      this.logger.log(
        `Reminders sent: ${dueSoonSent} due-soon (from ${dueSoonRows.length} candidates), ${overdueRows.length} overdue`,
      )
    } catch (err) {
      this.logger.error('Due-date reminder job failed', err)
    }
  }

  /**
   * End-of-day: warn anyone who left a timer running (Plan §8.1).
   */
  @Cron(CronExpression.EVERY_DAY_AT_6PM)
  async warnLeftRunningTimers() {
    try {
      const running = await this.db
        .select({
          userId: timeEntries.userId,
          taskId: tasks.id,
          taskTitle: tasks.title,
          workspaceId: spaces.workspaceId,
          startedAt: timeEntries.startedAt,
        })
        .from(timeEntries)
        .innerJoin(tasks, eq(tasks.id, timeEntries.taskId))
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(isNull(timeEntries.endedAt))

      for (const row of running) {
        void this.notifications.create({
          userId: row.userId,
          workspaceId: row.workspaceId,
          type: 'task_updated',
          title: 'Timer still running',
          body: `Your timer on “${row.taskTitle}” is still running — don't forget to stop it.`,
          target: { entityType: 'task', entityId: row.taskId, url: `/app/${row.workspaceId}/time` },
        })
      }
      if (running.length) this.logger.log(`End-of-day: warned ${running.length} running timers`)
    } catch (err) {
      this.logger.error('End-of-day timer warning job failed', err)
    }
  }
}
