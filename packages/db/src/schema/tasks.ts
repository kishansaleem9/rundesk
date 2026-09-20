import { pgTable, text, timestamp, uuid, boolean, integer, index, uniqueIndex, jsonb, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { lists } from './lists'
import { users } from './users'
import { taskPriorityEnum, containerVisibilityEnum } from './enums'
import { taskTypes } from './task-types'

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
  /*
   * §V2-09 — the banner across the top of the task detail.
   *
   * Frame `03:10` shows the picker: Gallery | Upload | Link | Search |
   * Attachments, with Remove, and the banner then offering Reposition and
   * Change cover. Two of those set a COLOUR and three set an IMAGE, so the two
   * are stored separately rather than one field holding either — whichever was
   * set last wins, and clearing one does not disturb the other.
   *
   * A CSS color/gradient string (the Gallery tab).
   */
  coverColor:    text('cover_color'),
  /*
   * An image the workspace uploaded, or one already attached to the task. Held
   * as a STORAGE KEY and presigned on read, never as a URL.
   *
   * Deliberately not one column shared with `coverImageUrl` below. Task
   * attachments already made that mistake — a hyperlink attachment is written
   * into `storage_key` and then read back through `r2.getObjectUrl`, which
   * either prefixes the CDN host onto `https://…` or presigns a bucket key
   * named after somebody's URL. Both are dead links. Keeping the two apart is
   * what stops this repeating it.
   */
  coverStorageKey: text('cover_storage_key'),
  /** An image somewhere else on the web — the picker's Link tab. Used as-is. */
  coverImageUrl:   text('cover_image_url'),
  /*
   * Reposition: how far down the image to sit in the banner, 0–100, as a
   * percentage for `object-position`. 50 is centred, which is what an image
   * gets before anybody drags it.
   */
  coverOffsetY:    integer('cover_offset_y').notNull().default(50),
  // Milestone marker (Plan §5 timeline): a key deliverable, rendered as a
  // diamond on the timeline and badged in lists.
  isMilestone:   boolean('is_milestone').notNull().default(false),
  // What this task *is* (Task / Campaign / Invoice …). Nullable: untyped is a
  // valid state, and deleting a type SET NULLs this rather than the task.
  taskTypeId:    uuid('task_type_id').references(() => taskTypes.id, { onDelete: 'set null' }),
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
  /**
   * "Not live." Set by BOTH archiving and deleting, because every read path in
   * the product (lists, search, reports, planner, AI) hides a task on this one
   * flag and a delete that left it false would leave the task on screen.
   * Which of the two it was is `deletedAt`, below.
   */
  isArchived:    boolean('is_archived').notNull().default(false),
  // §13.4 Trash — when the item was ARCHIVED and by whom (null = unknown/legacy).
  archivedAt:   timestamp('archived_at', { withTimezone: true }),
  archivedById: uuid('archived_by_id').references(() => users.id, { onDelete: 'set null' }),
  /**
   * §V2-08 frame `15:32` — the task menu draws **Archive** and **Delete** as two
   * rows, and until now Rundesk had one soft archive wearing both names.
   *
   * These two columns are what makes them different things:
   *
   *   archive → isArchived=true, archivedAt set, deletedAt NULL
   *             · listed under GET /workspaces/:id/archived-tasks
   *             · restored by POST /tasks/:id/restore
   *             · kept for good — the retention purge never sees it
   *   delete  → isArchived=true, deletedAt + deletedById set
   *             · listed in the workspace Trash beside spaces/lists/docs
   *             · restored by POST /workspaces/:id/trash/task/:id/restore
   *             · hard-deleted by the same nightly purge after
   *               TRASH_RETENTION_DAYS, or at once via "Delete forever"
   *
   * `deletedAt` is the ONLY thing the Trash selects tasks on, so an archived
   * task can never appear there and can never be purged.
   */
  deletedAt:    timestamp('deleted_at', { withTimezone: true }),
  deletedById:  uuid('deleted_by_id').references(() => users.id, { onDelete: 'set null' }),
  // §2 per-item privacy: a 'private' task is visible only to its creator, its
  // assignees, and workspace managers/admins (enforced on every read path).
  visibility:    containerVisibilityEnum('visibility').notNull().default('public'),
  createdAt:     timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_tasks_list_status').on(t.listId, t.status),
  index('tasks_task_type_idx').on(t.taskTypeId),
  // The Trash lists binned tasks newest-first and the nightly purge scans by
  // age; both read this column and nothing else.
  index('idx_tasks_deleted_at').on(t.deletedAt),
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
  // §1.1 — so a task read can carry what kind of task it is without a second
  // query per row. The type was settable and filterable but never displayed
  // anywhere a member scans work.
  taskType:   one(taskTypes, { fields: [tasks.taskTypeId], references: [taskTypes.id] }),
}))

export const taskAssigneesRelations = relations(taskAssignees, ({ one }) => ({
  task: one(tasks, { fields: [taskAssignees.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskAssignees.userId], references: [users.id] }),
}))
