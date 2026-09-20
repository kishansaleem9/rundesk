"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.favoritesRelations = exports.favorites = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
/**
 * A user's pinned items for quick navigation (Plan §2 quick-access sidebar).
 * Polymorphic by (entityType, entityId) so any surface — space, list, task,
 * doc, or chat channel — can be favorited without a table per type. The target
 * is intentionally not FK-constrained (it spans five tables); dangling rows are
 * skipped and pruned at read time.
 */
exports.favorites = (0, pg_core_1.pgTable)('favorites', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    entityType: (0, pg_core_1.text)('entity_type').$type().notNull(),
    entityId: (0, pg_core_1.uuid)('entity_id').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uniqFavorite: (0, pg_core_1.uniqueIndex)('favorites_user_entity_unique').on(t.userId, t.entityType, t.entityId),
    byUserWorkspace: (0, pg_core_1.index)('favorites_user_workspace_idx').on(t.userId, t.workspaceId),
}));
exports.favoritesRelations = (0, drizzle_orm_1.relations)(exports.favorites, ({ one }) => ({
    user: one(users_1.users, { fields: [exports.favorites.userId], references: [users_1.users.id] }),
    workspace: one(workspaces_1.workspaces, { fields: [exports.favorites.workspaceId], references: [workspaces_1.workspaces.id] }),
}));
//# sourceMappingURL=favorites.js.map