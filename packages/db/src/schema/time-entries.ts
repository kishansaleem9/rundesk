import { pgTable, text, timestamp, uuid, integer, boolean } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tasks } from './tasks'
import { users } from './users'

export const timeEntries = pgTable('time_entries', {
  id:          uuid('id').primaryKey().defaultRandom(),
  taskId:      uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  startedAt:   timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt:     timestamp('ended_at', { withTimezone: true }),
  durationSec: integer('duration_sec'), // null while timer is running; set on stop or on manual create
  description: text('description'),
  isBillable:  boolean('is_billable').notNull().default(false),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  task: one(tasks, { fields: [timeEntries.taskId], references: [tasks.id] }),
  user: one(users, { fields: [timeEntries.userId], references: [users.id] }),
}))
