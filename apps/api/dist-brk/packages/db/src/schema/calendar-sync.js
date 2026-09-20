"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userIcalTokensRelations = exports.userIcalTokens = exports.taskCalendarLinksRelations = exports.taskCalendarLinks = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const tasks_1 = require("./tasks");
const users_1 = require("./users");
const workspaces_1 = require("./workspaces");
/**
 * Maps a rundesk task to the external calendar event we created for it.
 * Lets us update / delete the right event when the task changes and skip
 * duplicate inserts when the task is re-synced.
 *
 * One task can be mirrored to multiple providers (e.g. both Google and
 * Outlook for the same workspace), so the unique key is (taskId, provider,
 * userId) — the user dimension scopes it to the calendar owner.
 */
exports.taskCalendarLinks = (0, pg_core_1.pgTable)('task_calendar_links', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    taskId: (0, pg_core_1.uuid)('task_id').notNull().references(() => tasks_1.tasks.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    provider: (0, pg_core_1.text)('provider').notNull(), // 'gcal' | 'outlook'
    externalCalendarId: (0, pg_core_1.text)('external_calendar_id').notNull(),
    externalEventId: (0, pg_core_1.text)('external_event_id').notNull(),
    // Etag from the provider — used for optimistic-concurrency pulls so we
    // only update tasks when the calendar actually moved.
    etag: (0, pg_core_1.text)('etag'),
    lastSyncedAt: (0, pg_core_1.timestamp)('last_synced_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_task_calendar_links_task_provider_user').on(t.taskId, t.provider, t.userId),
    (0, pg_core_1.index)('idx_task_calendar_links_event').on(t.provider, t.externalEventId),
    (0, pg_core_1.index)('idx_task_calendar_links_user').on(t.userId, t.workspaceId),
]);
exports.taskCalendarLinksRelations = (0, drizzle_orm_1.relations)(exports.taskCalendarLinks, ({ one }) => ({
    task: one(tasks_1.tasks, { fields: [exports.taskCalendarLinks.taskId], references: [tasks_1.tasks.id] }),
    user: one(users_1.users, { fields: [exports.taskCalendarLinks.userId], references: [users_1.users.id] }),
    workspace: one(workspaces_1.workspaces, { fields: [exports.taskCalendarLinks.workspaceId], references: [workspaces_1.workspaces.id] }),
}));
/**
 * Per-user-per-workspace iCal subscription token. The token is the secret
 * part of the public-but-unguessable feed URL `/ical/:token.ics`. Each user
 * can mint one per workspace; rotating it invalidates the old subscription
 * across every calendar app it was added to.
 */
exports.userIcalTokens = (0, pg_core_1.pgTable)('user_ical_tokens', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    token: (0, pg_core_1.text)('token').notNull(),
    revokedAt: (0, pg_core_1.timestamp)('revoked_at', { withTimezone: true }),
    lastUsedAt: (0, pg_core_1.timestamp)('last_used_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_user_ical_tokens_token').on(t.token),
    (0, pg_core_1.unique)('uq_user_ical_tokens_user_ws').on(t.userId, t.workspaceId),
]);
exports.userIcalTokensRelations = (0, drizzle_orm_1.relations)(exports.userIcalTokens, ({ one }) => ({
    user: one(users_1.users, { fields: [exports.userIcalTokens.userId], references: [users_1.users.id] }),
    workspace: one(workspaces_1.workspaces, { fields: [exports.userIcalTokens.workspaceId], references: [workspaces_1.workspaces.id] }),
}));
//# sourceMappingURL=calendar-sync.js.map