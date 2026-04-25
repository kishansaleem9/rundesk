import { pgTable, timestamp, uuid, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tasks } from './tasks'
import { users } from './users'
import { dependencyTypeEnum } from './enums'

// taskId has this relationship to relatedTaskId.
// For 'blocks', task {taskId} blocks {relatedTaskId}.
// For 'blocked_by', task {taskId} is blocked by {relatedTaskId}.
export const taskDependencies = pgTable('task_dependencies', {
  id:             uuid('id').primaryKey().defaultRandom(),
  taskId:         uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  relatedTaskId:  uuid('related_task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  type:           dependencyTypeEnum('type').notNull(),
  createdById:    uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('uq_task_dep_unique').on(t.taskId, t.relatedTaskId, t.type),
])

export const taskDependenciesRelations = relations(taskDependencies, ({ one }) => ({
  task:        one(tasks, { fields: [taskDependencies.taskId], references: [tasks.id], relationName: 'dependencies_from' }),
  relatedTask: one(tasks, { fields: [taskDependencies.relatedTaskId], references: [tasks.id], relationName: 'dependencies_to' }),
}))
