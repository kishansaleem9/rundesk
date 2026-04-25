import { pgTable, timestamp, uuid, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tasks } from './tasks'
import { users } from './users'

export const taskWatchers = pgTable('task_watchers', {
  id:       uuid('id').primaryKey().defaultRandom(),
  taskId:   uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  userId:   uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  addedAt:  timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('uq_task_watcher').on(t.taskId, t.userId),
])

export const taskWatchersRelations = relations(taskWatchers, ({ one }) => ({
  task: one(tasks, { fields: [taskWatchers.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskWatchers.userId], references: [users.id] }),
}))
