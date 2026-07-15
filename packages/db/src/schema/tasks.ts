import { pgTable, text, timestamp, uuid, boolean, integer, index, uniqueIndex, jsonb, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { lists } from './lists'
import { users } from './users'
import { taskPriorityEnum } from './enums'

/**
 * Status workflow buckets. Every per-list custom status (in `list_statuses`)
 * maps to one of these so reports, automations, and "is this task done?"
 * checks remain stable as users rename / reorder their pipelines.
 */
export type StatusCategory = 'open' | 'in_progress' | 'closed'

export const tasks = pgTable('tasks', {
  id:            uuid('id').primaryKey().defaultRandom(),
  listId:        uuid('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
  parentTaskId:  uuid('parent_task_id').references((): AnyPgColumn => tasks.id, { onDelete: 'cascade' }),
  createdById:   uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  title:         text('title').notNull(),
  description:   text('description'),
  priority:      taskPriorityEnum('priority').notNull().default('normal'),
  // `status` was a pgEnum (task_status) but is now a free-text key that must
  // match one of the list's `list_statuses.key` rows. The original 6 enum
  // values still work as defaults for back-compat.
  status:        text('status').notNull().default('todo'),
  // Derived bucket from the list status, denormalised onto the task so we
  // don't need to join list_statuses on every query.
  statusCategory: text('status_category').$type<StatusCategory>().notNull().default('open'),
  position:      integer('position').notNull().default(0),
  startDate:     timestamp('start_date', { withTimezone: true }),
  dueDate:       timestamp('due_date', { withTimezone: true }),
  completedAt:   timestamp('completed_at', { withTimezone: true }),
  timeEstimate:  integer('time_estimate'), // seconds
  // Optional cover for the task detail header: a CSS color/gradient string.
  coverColor:    text('cover_color'),
  // Milestone marker (Plan §5 timeline): a key deliverable, rendered as a
  // diamond on the timeline and badged in lists.
  isMilestone:   boolean('is_milestone').notNull().default(false),
  // Persisted recurrence config. When set and the task is completed, the next
  // occurrence is auto-created and the config moves forward to it (0038).
  recurrence:    jsonb('recurrence').$type<{
    cadenceDays?: number | null
    rule?: {
      mode: 'daily' | 'weekly' | 'monthly'
      interval?: number
      weekdays?: number[]
      dayOfMonth?: number
      skipWeekends?: boolean
    } | null
  }>(),
  isArchived:    boolean('is_archived').notNull().default(false),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_tasks_list_status').on(t.listId, t.status),
])

export const taskAssignees = pgTable('task_assignees', {
  id:     uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // A user is assigned to a task at most once; makes addAssignee's
  // onConflictDoNothing actually dedupe (Plan §5 bulk-assign).
  taskUserUnique: uniqueIndex('task_assignees_task_user_unique').on(t.taskId, t.userId),
}))

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
