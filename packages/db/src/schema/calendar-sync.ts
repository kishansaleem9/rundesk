import { pgTable, text, timestamp, uuid, unique, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tasks } from './tasks'
import { users } from './users'
import { workspaces } from './workspaces'

/**
 * Maps a rundesk task to the external calendar event we created for it.
 * Lets us update / delete the right event when the task changes and skip
 * duplicate inserts when the task is re-synced.
 *
 * One task can be mirrored to multiple providers (e.g. both Google and
 * Outlook for the same workspace), so the unique key is (taskId, provider,
 * userId) — the user dimension scopes it to the calendar owner.
 */
export const taskCalendarLinks = pgTable(
  'task_calendar_links',
  {
    id:                 uuid('id').primaryKey().defaultRandom(),
    taskId:             uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    userId:             uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    workspaceId:        uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    provider:           text('provider').notNull(), // 'gcal' | 'outlook'
    externalCalendarId: text('external_calendar_id').notNull(),
    externalEventId:    text('external_event_id').notNull(),
    // Etag from the provider — used for optimistic-concurrency pulls so we
    // only update tasks when the calendar actually moved.
    etag:               text('etag'),
    lastSyncedAt:       timestamp('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:          timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_task_calendar_links_task_provider_user').on(t.taskId, t.provider, t.userId),
    index('idx_task_calendar_links_event').on(t.provider, t.externalEventId),
    index('idx_task_calendar_links_user').on(t.userId, t.workspaceId),
  ],
)

export const taskCalendarLinksRelations = relations(taskCalendarLinks, ({ one }) => ({
  task:      one(tasks,      { fields: [taskCalendarLinks.taskId],      references: [tasks.id] }),
  user:      one(users,      { fields: [taskCalendarLinks.userId],      references: [users.id] }),
  workspace: one(workspaces, { fields: [taskCalendarLinks.workspaceId], references: [workspaces.id] }),
}))

/**
 * Per-user-per-workspace iCal subscription token. The token is the secret
 * part of the public-but-unguessable feed URL `/ical/:token.ics`. Each user
 * can mint one per workspace; rotating it invalidates the old subscription
 * across every calendar app it was added to.
 */
export const userIcalTokens = pgTable(
  'user_ical_tokens',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    token:       text('token').notNull(),
    revokedAt:   timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt:  timestamp('last_used_at', { withTimezone: true }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_user_ical_tokens_token').on(t.token),
    unique('uq_user_ical_tokens_user_ws').on(t.userId, t.workspaceId),
  ],
)

export const userIcalTokensRelations = relations(userIcalTokens, ({ one }) => ({
  user:      one(users,      { fields: [userIcalTokens.userId],      references: [users.id] }),
  workspace: one(workspaces, { fields: [userIcalTokens.workspaceId], references: [workspaces.id] }),
}))
