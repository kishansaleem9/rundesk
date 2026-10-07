import { pgTable, text, timestamp, uuid, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { tasks } from './tasks'
import { clickupImportJobs } from './clickup-import-jobs'

export const labels = pgTable('labels', {
  id:          uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name:        text('name').notNull(),
  color:       text('color').notNull(),
  // Which import made this row (Settings › Imports / Exports); null for everything else.
  importId: uuid('import_id').references(() => clickupImportJobs.id, { onDelete: 'set null' }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('uq_label_name_per_workspace').on(t.workspaceId, t.name),
])

export const taskLabelAssignments = pgTable('task_label_assignments', {
  id:      uuid('id').primaryKey().defaultRandom(),
  taskId:  uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  labelId: uuid('label_id').notNull().references(() => labels.id, { onDelete: 'cascade' }),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('uq_task_label_unique').on(t.taskId, t.labelId),
])

export const labelsRelations = relations(labels, ({ one, many }) => ({
  workspace:   one(workspaces, { fields: [labels.workspaceId], references: [workspaces.id] }),
  assignments: many(taskLabelAssignments),
}))

export const taskLabelAssignmentsRelations = relations(taskLabelAssignments, ({ one }) => ({
  task:  one(tasks, { fields: [taskLabelAssignments.taskId], references: [tasks.id] }),
  label: one(labels, { fields: [taskLabelAssignments.labelId], references: [labels.id] }),
}))
