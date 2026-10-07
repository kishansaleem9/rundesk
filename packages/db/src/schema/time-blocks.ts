import { pgTable, text, timestamp, uuid, boolean, index, check, foreignKey } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'
import { tasks } from './tasks'
import { userCalendarAccounts } from './calendar-accounts'

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
    /**
     * The default calendar this block was written to, and the event it became
     * there (`found-25-sep/connected-calendars-read-by-nothing`): moving the
     * block moves that event, deleting it deletes it. Set null when the account
     * is disconnected; the event stays in their calendar, theirs to keep.
     */
    calendarAccountId: uuid('calendar_account_id'),
    externalEventId:   text('external_event_id'),
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
    // Named: drizzle's own name for it is 65 characters and Postgres keeps 63
    // (migration 0173).
    foreignKey({
      name: 'task_time_blocks_calendar_account_fk',
      columns: [t.calendarAccountId],
      foreignColumns: [userCalendarAccounts.id],
    }).onDelete('set null'),
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
  /**
   * §V2-15a, frame `14:05` — **Grid size**, the FIRST control on the Appearance
   * page: "Choose how large events and time slots appear in the grid", with
   * three previews labelled Default · Large · XL.
   *
   * It is the hour-row height, not a font size. The frame's three swatches all
   * draw the same event ("Team sync · 9 – 11am") at three heights, which is
   * what a grid-size control means on a calendar: the same day, more room.
   *
   * Reader: `workspace-planner-page.tsx` — `HOUR_PX` is chosen from this, and
   * the now-line, the block rectangles and the hour gutter all derive from that
   * one number, so there is no second place that could disagree about how tall
   * an hour is.
   */
  gridSize?: 'default' | 'large' | 'xl'
  /**
   * §V2-14d, frame `13:28` — the calendars NOT drawn on the grid.
   *
   * A HIDE-LIST, NOT A SHOW-LIST, and the direction is the whole design. With a
   * show-list, a calendar connected tomorrow is absent from it and therefore
   * invisible — a person connects Google, nothing appears, and there is no way
   * to tell that from the sync being broken. With a hide-list, a new calendar
   * is visible until somebody says otherwise, and "I turned this off" is the
   * only state that has to be remembered.
   *
   * Ids are the workspace calendar keys (`workspace:timeOff`, `workspace:holidays`)
   * only. An ACCOUNT's row in the picker is not stored here: it writes the
   * account's own `countsAsBusy` column, because that column already means
   * "this calendar is read", and a second per-user flag saying the same thing
   * is the one-fact-two-copies bug this ledger keeps finding.
   *
   * Readers: `workspace-planner-page.tsx` — `planner-holiday-chip` and
   * `planner-timeoff-chip` are not drawn for a hidden calendar.
   */
  hiddenCalendarIds?: string[]
  /**
   * §V2-15b, frame `12:48`'s **Team schedules** card — whose columns the
   * side-by-side grid draws.
   *
   * Separate from "Meet with", which is one person overlaid on YOUR week. This
   * is several people beside each other, each in their own column, and the two
   * answer different questions: "when is Sara free" versus "when are all four
   * of us free". Persisted because the set of people you schedule around is
   * stable, and re-picking them on every visit is the thing that makes a
   * feature not get used.
   */
  teamScheduleUserIds?: string[]
  /**
   * §V2-15c, frames `12:40`–`12:50` — the planner onboarding panel has been
   * dismissed.
   *
   * Dismissal is remembered SERVER-SIDE rather than in `localStorage`, because
   * the panel is about an account-level fact (no calendar is connected) and a
   * person who dismissed it on their laptop has not asked to see it again on
   * their phone.
   */
  plannerOnboardingDismissed?: boolean
  /**
   * Frames `14:13`–`14:16` — the planner rail's shown sections, in the order the
   * rail draws them (`ledger-rows/row-835-reorder`). Each of the five at most
   * once; the planner service refuses anything else.
   *
   * Reader: `railSectionsShown` (`planner-settings-dialog.tsx`), for the rail
   * and the Sidebar page both.
   */
  railSections?: string[]
  /** "Default event duration", shown as `1 hour`. */
  defaultDurationMinutes?: number
  /**
   * "Color tasks by", shown as `None`.
   *
   * FOUR VALUES, and the fourth is the one the pickers kept losing. The web
   * dialog's own copy of this type listed `'none' | 'priority' | 'status'`
   * while the controller accepted `'list'` and the service stored it — the
   * duplicated-list defect, in the smallest possible form: a server that
   * accepts a value no control can send and no reader could colour by.
   */
  colorTasksBy?: 'none' | 'priority' | 'status' | 'list'
  showWeekends?: boolean
  /**
   * §V2-02e, frame `14:10`'s **Others** group — the five that were declared,
   * stored, accepted by the controller, round-tripped through Postgres and
   * READ BY NOTHING. Five dead keys sitting among six working siblings, which
   * is exactly why nobody noticed: every neighbour worked.
   *
   * Each one now names the reader that honours it, so the next person can
   * check the claim rather than trust it.
   */
  /** Week number beside the month in the planner header — WEEK VIEW ONLY.
   *  Reader: `workspace-planner-page.tsx`, `planner-week-number`. */
  showWeekNumbers?: boolean
  /** Opening the planner lands on the start of the week, not on today.
   *  Reader: `workspace-planner-page.tsx`, the one-shot anchor effect. */
  alwaysOpenAtStartOfWeek?: boolean
  /** Dim the hours outside the workspace's work schedule (`work_days` plus
   *  `workspace_holidays`) on the grid.
   *  Reader: `workspace-planner-page.tsx`, `planner-nonworking`. */
  darkenNonWorkingHours?: boolean
  /** A typed personal event saves on Enter instead of asking to confirm.
   *  Reader: `workspace-planner-page.tsx`, `planner-event-confirm`. */
  savePersonalEventsQuickly?: boolean
  /**
   * The Time-blocking page. `blockPrefix` is the "Work on" of frame `14:45` —
   * dragging task `dbgdh` onto the grid makes a block called "Work on dbgdh".
   */
  blockPrefix?: string | null
  showAssigned?: boolean
  /** Future occurrences of a block whose task recurs, projected onto the grid.
   *  Reader: `workspace-planner-page.tsx`, `planner-recurring-block`. */
  showRecurring?: boolean
  showOverdue?: boolean
  /**
   * §V2-02e, frame `14:10`'s **Upcoming meeting** page.
   *
   * The nav page that was left out because it was "mostly a desktop menubar".
   * The countdown and the quick-join it configures are not a menubar: they are
   * `workspace-meetings-page.tsx`'s Upcoming list, which has drawn both since
   * §2.8 with nothing able to turn either off.
   */
  /** The "in 5m" badge on the Upcoming list. */
  upcomingShowTimeLeft?: boolean
  /** The Join pill on the Upcoming list. */
  upcomingQuickJoin?: boolean
  /** "Show in desktop" — a desktop notification when a meeting is joinable. */
  upcomingDesktopNotify?: boolean
  /**
   * "Default list for new tasks — defaults to your personal list".
   *
   * This is the answer to the question video 1 left open: where a task created
   * from a message, from `/task`, or by the AI should land. Null means the
   * person's own list, which is what ClickUp defaults to.
   */
  defaultListId?: string | null
}
