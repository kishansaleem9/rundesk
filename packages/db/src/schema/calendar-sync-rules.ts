import { pgTable, text, timestamp, uuid, boolean, index, uniqueIndex, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { users } from './users'
import { workspaces } from './workspaces'
import { tasks } from './tasks'
import { userCalendarAccounts } from './calendar-accounts'

/** Where a sync draws its tasks from: a Space, a Folder, a Project or a List. */
export const CALENDAR_SYNC_SCOPES = ['space', 'folder', 'project', 'list'] as const
export type CalendarSyncScope = (typeof CALENDAR_SYNC_SCOPES)[number]

/**
 * WHICH TASKS GO TO WHICH OF A PERSON'S CALENDARS — ClickUp's "Sync tasks to
 * calendar" (`ledger-rows/row-1962`), the planner's Automations page in frame
 * `14:32`: "Sync ClickUp tasks to Google Calendar", "Pick a list, folder, or
 * space…", "+ Add sync".
 *
 * A sync is its maker's: a place (a Space, Folder, Project or List) and one of
 * their own connected calendars (`user_calendar_accounts`), with all the tasks
 * there or only those assigned to them. ClickUp's integration is private — no
 * one else reaches a person's calendar through it — and it syncs into a
 * calendar of their own, never a shared one. Nothing syncs until a sync is
 * added: the push wrote every dated task to every calendar connected to the
 * workspace, with no table saying where and no switch to stop it.
 *
 * `scope_id` names a row of the table `scope_type` says, so it carries no
 * foreign key; a place gone is a sync that takes nothing, and the page says so.
 */
export const calendarSyncRules = pgTable(
  'calendar_sync_rules',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    workspaceId:  uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId:       uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** The calendar the tasks go to — one of `user_id`'s own accounts. */
    accountId:    uuid('account_id').notNull().references(() => userCalendarAccounts.id, { onDelete: 'cascade' }),
    scopeType:    text('scope_type').$type<CalendarSyncScope>().notNull(),
    scopeId:      uuid('scope_id').notNull(),
    /** ClickUp's "only tasks assigned to me", against "all tasks" there. */
    assignedOnly: boolean('assigned_only').notNull().default(false),
    createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One sync of a place per calendar: a second would write nothing the first does not.
    uniqueIndex('uq_calendar_sync_rules_place').on(t.accountId, t.scopeType, t.scopeId),
    index('idx_calendar_sync_rules_workspace').on(t.workspaceId),
    check('calendar_sync_rules_scope_type', sql`${t.scopeType} IN ('space', 'folder', 'project', 'list')`),
  ],
)

/**
 * THE EVENT A TASK BECAME IN ONE CALENDAR, so a change to the task changes it
 * and a task that leaves the sync takes it off. One per task and calendar,
 * however many syncs of that calendar the task is in. `fingerprint` is what was
 * written, so a change to the task that the event does not show writes nothing.
 */
export const calendarSyncEvents = pgTable(
  'calendar_sync_events',
  {
    id:              uuid('id').primaryKey().defaultRandom(),
    accountId:       uuid('account_id').notNull().references(() => userCalendarAccounts.id, { onDelete: 'cascade' }),
    taskId:          uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    externalEventId: text('external_event_id').notNull(),
    fingerprint:     text('fingerprint').notNull(),
    syncedAt:        timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uq_calendar_sync_events_account_task').on(t.accountId, t.taskId),
    index('idx_calendar_sync_events_task').on(t.taskId),
  ],
)

export type CalendarSyncRule = typeof calendarSyncRules.$inferSelect
