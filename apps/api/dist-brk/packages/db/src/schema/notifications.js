"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationsRelations = exports.notifications = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const users_1 = require("./users");
const workspaces_1 = require("./workspaces");
const enums_1 = require("./enums");
exports.notifications = (0, pg_core_1.pgTable)('notifications', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    actorId: (0, pg_core_1.uuid)('actor_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    type: (0, enums_1.notificationTypeEnum)('type').notNull(),
    title: (0, pg_core_1.text)('title').notNull(),
    body: (0, pg_core_1.text)('body'),
    // Deep-link target: { entityType: 'task', entityId: '...', url: '/app/...' }
    target: (0, pg_core_1.jsonb)('target').$type(),
    readAt: (0, pg_core_1.timestamp)('read_at', { withTimezone: true }),
    // Inbox triage (§A2.6). Read-state alone can't express "cleared" or "later":
    // dismissedAt moves a row to Cleared, snoozedUntil parks it in Later until
    // that moment passes, at which point it returns to the Inbox on its own.
    dismissedAt: (0, pg_core_1.timestamp)('dismissed_at', { withTimezone: true }),
    snoozedUntil: (0, pg_core_1.timestamp)('snoozed_until', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.index)('idx_notifications_user_unread').on(t.userId, t.readAt),
    (0, pg_core_1.index)('idx_notifications_user_triage').on(t.userId, t.dismissedAt, t.snoozedUntil),
]);
exports.notificationsRelations = (0, drizzle_orm_1.relations)(exports.notifications, ({ one }) => ({
    user: one(users_1.users, { fields: [exports.notifications.userId], references: [users_1.users.id] }),
    actor: one(users_1.users, { fields: [exports.notifications.actorId], references: [users_1.users.id] }),
    workspace: one(workspaces_1.workspaces, { fields: [exports.notifications.workspaceId], references: [workspaces_1.workspaces.id] }),
}));
//# sourceMappingURL=notifications.js.map