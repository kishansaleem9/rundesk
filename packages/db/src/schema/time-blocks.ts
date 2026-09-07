import { pgTable, text, timestamp, uuid, boolean, index, check } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'
import { tasks } from './tasks'

/**
 * §V2-02 — the Planner's time blocks.
 *
 * `[14:52]` "Yahan pe jo mujhe task add hote hain, main un ko bhi apne planner
 * mein add kar sakti hoon DRAG AND DROP se", and `[14:56]` "to yeh meri planner
 * pe bhi show honge — yaani ke Google Calendar pe aur yahan pe bhi." Frame
 * `13:08` is the grid they land on: a week, an all-day row, an hour gutter and
 * a red now-line.
 *
 * `grep -ri "time.block\|time_block"` across `apps/` and `packages/` returned
 * zero files before this. Rundesk's calendar was a list VIEW TYPE and a
 * read-only strip on the person panel; there was nowhere for "I will do this
 * task from 2 to 4 on Thursday" to be recorded.
 *
 * A BLOCK IS NOT A TASK, AND NOT A DUE DATE.
 *
 * A due date says when something must be finished. A block says when you
 * intend to work on it, and there can be several for one task — an hour on
 * Tuesday and two more on Thursday is the normal shape of real work. That is
 * why this is its own table rather than columns on `tasks`: the moment you
 * allow two, a column cannot hold it.
 *
 * `taskId` is nullable for the same reason `user_priorities.taskId` is: a block
 * can be "lunch" or "school run", and requiring a task first would make the
 * fast case slow. `title` carries those; a task-backed block leaves it null and
 * renders from the task, so renaming the task renames the block.
 */
export const taskTimeBlocks = pgTable(
  'task_time_blocks',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Whose planner this block is on. Blocks are personal, like priorities. */
    userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** The task being worked on, when the block is about one. */
    taskId:      uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    /** The typed label, when the block is not about a task. */
    title:       text('title'),
    startsAt:    timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt:      timestamp('ends_at', { withTimezone: true }).notNull(),
    /** Frame `13:08`'s "All day" row, which sits above the hour gutter. */
    isAllDay:    boolean('is_all_day').notNull().default(false),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The read the grid makes: "my blocks in this workspace, in this week".
    index('idx_task_time_blocks_owner_span').on(t.userId, t.workspaceId, t.startsAt),
    // The read the task detail makes: "when am I doing this one".
    index('idx_task_time_blocks_task').on(t.taskId),
    // A block is about a task or carries a label — never neither, or the grid
    // draws a rectangle with nothing in it and no way to find out what it was.
    check('task_time_blocks_has_subject', sql`${t.taskId} is not null or ${t.title} is not null`),
    // Zero-length and backwards blocks are not a thing a calendar can draw.
    check('task_time_blocks_ends_after_starts', sql`${t.endsAt} > ${t.startsAt}`),
  ],
)

export const taskTimeBlocksRelations = relations(taskTimeBlocks, ({ one }) => ({
  workspace: one(workspaces, { fields: [taskTimeBlocks.workspaceId], references: [workspaces.id] }),
  user:      one(users,      { fields: [taskTimeBlocks.userId], references: [users.id] }),
  task:      one(tasks,      { fields: [taskTimeBlocks.taskId], references: [tasks.id] }),
}))

/**
 * §V2-02 — the Planner's own preferences, frame `14:10`.
 *
 * Deliberately NOT holding "Start week on", "Timezone" or the time format,
 * even though the Appearance page shows all three. `users` already has
 * `weekStart`, `timezone` and `timeFormat`, and a planner-local copy that
 * disagreed with the account would be a bug with a UI for creating it: the
 * grid would start on Monday while every date elsewhere started on Sunday.
 * The settings page reads and writes the existing columns for those.
 *
 * One jsonb rather than a column per switch, following `panelsCollapsed`:
 * these are the same kind of choice repeated, and the list grows.
 */
export type PlannerSettings = {
  /** Frame `14:10`: Subtle | Solid. */
  eventStyle?: 'subtle' | 'solid'
  /** "Default event duration", shown as `1 hour`. */
  defaultDurationMinutes?: number
  /** "Color tasks by", shown as `None`. */
  colorTasksBy?: 'none' | 'priority' | 'status' | 'list'
  showWeekends?: boolean
  showWeekNumbers?: boolean
  alwaysOpenAtStartOfWeek?: boolean
  darkenNonWorkingHours?: boolean
  savePersonalEventsQuickly?: boolean
  /**
   * The Time-blocking page. `blockPrefix` is the "Work on" of frame `14:45` —
   * dragging task `dbgdh` onto the grid makes a block called "Work on dbgdh".
   */
  blockPrefix?: string
  showAssigned?: boolean
  showRecurring?: boolean
  showOverdue?: boolean
  /**
   * "Default list for new tasks — defaults to your personal list".
   *
   * This is the answer to the question video 1 left open: where a task created
   * from a message, from `/task`, or by the AI should land. Null means the
   * person's own list, which is what ClickUp defaults to.
   */
  defaultListId?: string | null
}
