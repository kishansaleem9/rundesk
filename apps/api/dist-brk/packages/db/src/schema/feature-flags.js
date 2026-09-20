"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.featureFlagsRelations = exports.featureFlagRequests = exports.flagAuditLog = exports.featureFlags = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const enums_1 = require("./enums");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
// One row per flag override. Global scope has scopeId = null.
// Resolution order: user > role > workspace > global
exports.featureFlags = (0, pg_core_1.pgTable)('feature_flags', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    flagKey: (0, pg_core_1.text)('flag_key').notNull(),
    scope: (0, enums_1.flagScopeEnum)('scope').notNull(),
    scopeId: (0, pg_core_1.text)('scope_id'), // userId | workspaceId | roleName | null (global)
    workspaceId: (0, pg_core_1.uuid)('workspace_id').references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    enabled: (0, pg_core_1.boolean)('enabled').notNull(),
    updatedBy: (0, pg_core_1.text)('updated_by'),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_flag_scope').on(t.flagKey, t.scope, t.scopeId, t.workspaceId),
]);
exports.flagAuditLog = (0, pg_core_1.pgTable)('flag_audit_log', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    flagKey: (0, pg_core_1.text)('flag_key').notNull(),
    scope: (0, enums_1.flagScopeEnum)('scope').notNull(),
    scopeId: (0, pg_core_1.text)('scope_id'),
    workspaceId: (0, pg_core_1.uuid)('workspace_id'),
    fromEnabled: (0, pg_core_1.boolean)('from_enabled'),
    toEnabled: (0, pg_core_1.boolean)('to_enabled').notNull(),
    changedBy: (0, pg_core_1.uuid)('changed_by').notNull(),
    changedAt: (0, pg_core_1.timestamp)('changed_at', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: (0, pg_core_1.text)('ip_address'),
});
/**
 * §2.2 — "somebody asked for this feature", recorded once per press.
 *
 * The once-a-day rule used to be read off the `notifications` table: if this
 * requester had produced an access_requested row for this flag in the last
 * day, the ask was a repeat. That row is only written for an admin who has an
 * in-app channel switched on, so a workspace whose admins run email-only
 * produced no row and the rule never tripped — the same press could mail every
 * admin again and again.
 *
 * The ask is its own fact and does not depend on how anybody chose to be told
 * about it, so it is recorded as one.
 */
exports.featureFlagRequests = (0, pg_core_1.pgTable)('feature_flag_requests', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    flagKey: (0, pg_core_1.text)('flag_key').notNull(),
    requesterId: (0, pg_core_1.uuid)('requester_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    // The only way this is read: "has this person asked for this flag lately".
    (0, pg_core_1.index)('feature_flag_requests_recent_idx').on(t.workspaceId, t.flagKey, t.requesterId, t.createdAt),
]);
exports.featureFlagsRelations = (0, drizzle_orm_1.relations)(exports.featureFlags, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.featureFlags.workspaceId], references: [workspaces_1.workspaces.id] }),
}));
//# sourceMappingURL=feature-flags.js.map