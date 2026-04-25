import { pgTable, text, timestamp, uuid, boolean, integer, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { lists } from './lists'
import { users } from './users'
import { taskPriorityEnum, taskStatusEnum } from './enums'

export const tasks = pgTable('tasks', {
  id:            uuid('id').primaryKey().defaultRandom(),
  listId:        uuid('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
  parentTaskId:  uuid('parent_task_id').references((): AnyPgColumn => tasks.id, { onDelete: 'cascade' }),
  createdById:   uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  title:         text('title').notNull(),
  description:   text('description'),
  priority:      taskPriorityEnum('priority').notNull().default('normal'),
  status:        taskStatusEnum('status').notNull().default('todo'),
  position:      integer('position').notNull().default(0),
  startDate:     timestamp('start_date', { withTimezone: true }),
  dueDate:       timestamp('due_date', { withTimezone: true }),
  completedAt:   timestamp('completed_at', { withTimezone: true }),
  timeEstimate:  integer('time_estimate'), // seconds
  isArchived:    boolean('is_archived').notNull().default(false),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const taskAssignees = pgTable('task_assignees', {
  id:     uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
})

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  list:       one(lists, { fields: [tasks.listId], references: [lists.id] }),
  parent:     one(tasks, { fields: [tasks.parentTaskId], references: [tasks.id], relationName: 'subtasks' }),
  subtasks:   many(tasks, { relationName: 'subtasks' }),
  creator:    one(users, { fields: [tasks.createdById], references: [users.id] }),
  assignees:  many(taskAssignees),
}))

export const taskAssigneesRelations = relations(taskAssignees, ({ one }) => ({
  task: one(tasks, { fields: [taskAssignees.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskAssignees.userId], references: [users.id] }),
}))
