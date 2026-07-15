import { pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'
import { tasks } from './tasks'

/**
 * User-created reminders on a task (Plan §4/§10) — "remind me about this at
 * <time>". A background tick fires each due reminder once (notified_at is
 * stamped) and delivers it through the normal notification pipeline. Distinct
 * from the automated due-soon/overdue reminders in RemindersService.
 */
export const reminders = pgTable(
  'reminders',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    taskId:      uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    note:        text('note'),
    remindAt:    timestamp('remind_at', { withTimezone: true }).notNull(),
    // Stamped when the reminder has fired; null means still pending.
    notifiedAt:  timestamp('notified_at', { withTimezone: true }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Drives the "due and unfired" scan.
    byDue: index('reminders_due_idx').on(t.remindAt),
    byUser: index('reminders_user_idx').on(t.userId),
  }),
)

export const remindersRelations = relations(reminders, ({ one }) => ({
  workspace: one(workspaces, { fields: [reminders.workspaceId], references: [workspaces.id] }),
  user:      one(users, { fields: [reminders.userId], references: [users.id] }),
  task:      one(tasks, { fields: [reminders.taskId], references: [tasks.id] }),
}))
