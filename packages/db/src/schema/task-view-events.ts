import { index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { tasks } from './tasks'
import { users } from './users'
import { workspaces } from './workspaces'

/**
 * WHO OPENED WHICH TASK, AND WHEN — the task views ClickUp's Teams Analytics
 * logs ("logging task views … each person's most-viewed tasks";
 * `ledger-rows/section3-team-analytics`). A row when a person opens a task's
 * sheet, at most one a person a task in five minutes (`TasksService.logTaskView`),
 * so a reload or a second tab is one view and not two.
 */
export const taskViewEvents = pgTable('task_view_events', {
  id:          uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  taskId:      uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  viewedAt:    timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_task_view_events_workspace').on(t.workspaceId, t.viewedAt),
  index('idx_task_view_events_person').on(t.userId, t.taskId, t.viewedAt),
])
