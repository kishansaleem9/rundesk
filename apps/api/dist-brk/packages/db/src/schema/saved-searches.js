"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.savedSearchesRelations = exports.savedSearches = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
/**
 * A user's saved search filter preset (Plan §11.2). Scoped to a user +
 * workspace; `filters` mirrors the SearchFilters shape (types, statusCategory,
 * priority, assigneeId, labelId, dueAfter/dueBefore).
 */
exports.savedSearches = (0, pg_core_1.pgTable)('saved_searches', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    query: (0, pg_core_1.text)('query'),
    filters: (0, pg_core_1.jsonb)('filters').$type().notNull().default({}),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_saved_searches_user_ws_name').on(t.userId, t.workspaceId, t.name),
    (0, pg_core_1.index)('idx_saved_searches_user_ws').on(t.userId, t.workspaceId),
]);
exports.savedSearchesRelations = (0, drizzle_orm_1.relations)(exports.savedSearches, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.savedSearches.workspaceId], references: [workspaces_1.workspaces.id] }),
    user: one(users_1.users, { fields: [exports.savedSearches.userId], references: [users_1.users.id] }),
}));
//# sourceMappingURL=saved-searches.js.map