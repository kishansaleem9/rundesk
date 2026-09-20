"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.objectShares = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
const enums_1 = require("./enums");
/**
 * Share & Permissions — a single grant table for every shareable object, so a
 * folder / list / task / doc is shared the same way a space or project is, and
 * an outsider can be invited by email before they have a user row.
 *
 * Exactly one of `userId` / `invitedEmail` is set (enforced by a CHECK in
 * migration 0085). `level` reuses container_role: admin (full edit), edit,
 * comment, view. Resolution is most-specific-wins, done in the API.
 */
exports.objectShares = (0, pg_core_1.pgTable)('object_shares', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    // 'view' is §V2-07's "Sharing & Permissions" on a saved view (frames 10:36
    // and 11:14) — a view is shared like anything else rather than through a
    // second mechanism of its own.
    objectType: (0, pg_core_1.text)('object_type').$type().notNull(),
    objectId: (0, pg_core_1.uuid)('object_id').notNull(),
    userId: (0, pg_core_1.uuid)('user_id').references(() => users_1.users.id, { onDelete: 'cascade' }),
    invitedEmail: (0, pg_core_1.text)('invited_email'),
    level: (0, enums_1.containerRoleEnum)('level').notNull().default('view'),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.index)('idx_object_shares_object').on(t.objectType, t.objectId),
    (0, pg_core_1.index)('idx_object_shares_user').on(t.userId),
    (0, pg_core_1.index)('idx_object_shares_ws').on(t.workspaceId),
    (0, pg_core_1.uniqueIndex)('uq_object_shares_user').on(t.objectType, t.objectId, t.userId),
]);
//# sourceMappingURL=object-shares.js.map