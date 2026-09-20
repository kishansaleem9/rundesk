"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userDockConfigsRelations = exports.userDockConfigs = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const users_1 = require("./users");
const workspaces_1 = require("./workspaces");
exports.userDockConfigs = (0, pg_core_1.pgTable)('user_dock_configs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    pinnedLinks: (0, pg_core_1.jsonb)('pinned_links').notNull().default([]),
    /**
     * G04-7 [05:29] / G07-6 [08:26–08:31] — the sidebar arrangement, on the
     * account rather than the browser.
     *
     * Both lived in localStorage while everything else about a user — theme,
     * locale, notification preferences, and the dock appearance sitting in this
     * very row — was server-persisted. So it was an inconsistency rather than a
     * decision: sign in on another machine, or open a private window, and a
     * sidebar somebody had arranged reverted to four hard-coded defaults.
     *
     * Null, not `[]`, because "never arranged it" and "arranged it to be empty"
     * are different answers and only the first should get the defaults.
     */
    navFavorites: (0, pg_core_1.jsonb)('nav_favorites').$type(),
    navRecents: (0, pg_core_1.jsonb)('nav_recents').$type(),
    appearance: (0, pg_core_1.jsonb)('appearance').notNull().default({
        size: 'md',
        opacity: 0.8,
        theme: 'system'
    }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.userDockConfigsRelations = (0, drizzle_orm_1.relations)(exports.userDockConfigs, ({ one }) => ({
    user: one(users_1.users, { fields: [exports.userDockConfigs.userId], references: [users_1.users.id] }),
    workspace: one(workspaces_1.workspaces, { fields: [exports.userDockConfigs.workspaceId], references: [workspaces_1.workspaces.id] }),
}));
//# sourceMappingURL=user-dock-configs.js.map