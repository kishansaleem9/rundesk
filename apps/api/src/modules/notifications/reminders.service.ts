import { Injectable, Inject, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm'
import { tasks, taskAssignees, users, lists, projects, spaces, workspaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { NotificationsService } from './notifications.service'

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name)

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private notifications: NotificationsService,
  ) {}

  /**
   * Runs every day at 8 AM UTC.
   * Sends due-soon reminders (1 day, 2 days ahead) and overdue notifications.
   */
  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async sendDueDateReminders() {
    this.logger.log('Running due-date reminder job')
    try {
      const now = new Date()
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(23, 59, 59, 999)

      const in2days = new Date(now)
      in2days.setDate(in2days.getDate() + 2)
      in2days.setHours(23, 59, 59, 999)

      const today = new Date(now)
      today.setHours(0, 0, 0, 0)

      // Find tasks due within the next 2 days that aren't done/cancelled
      const dueSoonRows = await this.db
        .select({
          taskId: tasks.id,
          taskTitle: tasks.title,
          dueDate: tasks.dueDate,
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
            isNull(tasks.isArchived),
            gte(tasks.dueDate, today),
            lte(tasks.dueDate, in2days),
            // Exclude done and cancelled
            sql`${tasks.status} NOT IN ('done', 'cancelled')`,
          ),
        )

      for (const row of dueSoonRows) {
        const dueDate = row.dueDate ? new Date(row.dueDate) : null
        if (!dueDate) continue

        const diffMs = dueDate.getTime() - today.getTime()
        const diffDays = Math.ceil(diffMs / 86_400_000)
        const dueDateLabel =
          diffDays <= 1 ? 'tomorrow' : `in ${diffDays} days`

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
            isNull(tasks.isArchived),
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
        `Reminders sent: ${dueSoonRows.length} due-soon, ${overdueRows.length} overdue`,
      )
    } catch (err) {
      this.logger.error('Due-date reminder job failed', err)
    }
  }
}
