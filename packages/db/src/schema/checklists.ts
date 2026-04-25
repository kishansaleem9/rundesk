import { pgTable, text, timestamp, uuid, boolean, integer } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tasks } from './tasks'
import { users } from './users'

export const taskChecklists = pgTable('task_checklists', {
  id:        uuid('id').primaryKey().defaultRandom(),
  taskId:    uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  title:     text('title').notNull(),
  position:  integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const taskChecklistItems = pgTable('task_checklist_items', {
  id:          uuid('id').primaryKey().defaultRandom(),
  checklistId: uuid('checklist_id').notNull().references(() => taskChecklists.id, { onDelete: 'cascade' }),
  assigneeId:  uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  content:     text('content').notNull(),
  isDone:      boolean('is_done').notNull().default(false),
  position:    integer('position').notNull().default(0),
  dueDate:     timestamp('due_date', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const taskChecklistsRelations = relations(taskChecklists, ({ one, many }) => ({
  task:  one(tasks, { fields: [taskChecklists.taskId], references: [tasks.id] }),
  items: many(taskChecklistItems),
}))

export const taskChecklistItemsRelations = relations(taskChecklistItems, ({ one }) => ({
  checklist: one(taskChecklists, { fields: [taskChecklistItems.checklistId], references: [taskChecklists.id] }),
  assignee:  one(users,          { fields: [taskChecklistItems.assigneeId], references: [users.id] }),
}))
