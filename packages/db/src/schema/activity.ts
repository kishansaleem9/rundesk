import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tasks } from './tasks'
import { users } from './users'
import { activityActionEnum } from './enums'

// Activity log scoped to a task. Can be expanded to doc/chat activities via entityType.
export const taskActivity = pgTable('task_activity', {
  id:        uuid('id').primaryKey().defaultRandom(),
  taskId:    uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  actorId:   uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action:    activityActionEnum('action').notNull(),
  // Structured metadata: { from: 'todo', to: 'done', fieldName?: 'status' }
  meta:      jsonb('meta').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const taskActivityRelations = relations(taskActivity, ({ one }) => ({
  task:  one(tasks, { fields: [taskActivity.taskId], references: [tasks.id] }),
  actor: one(users, { fields: [taskActivity.actorId], references: [users.id] }),
}))
