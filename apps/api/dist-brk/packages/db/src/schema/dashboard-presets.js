"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardPresetsRelations = exports.dashboardPresets = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const users_1 = require("./users");
const workspaces_1 = require("./workspaces");
exports.dashboardPresets = (0, pg_core_1.pgTable)('dashboard_presets', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    layout: (0, pg_core_1.jsonb)('layout').notNull().default([]),
    isDefault: (0, pg_core_1.boolean)('is_default').notNull().default(false),
    // §5.7 — a workspace-default dashboard set by an admin. Applies to any member
    // who has no personal default. At most one per workspace (enforced in service).
    isWorkspaceDefault: (0, pg_core_1.boolean)('is_workspace_default').notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.dashboardPresetsRelations = (0, drizzle_orm_1.relations)(exports.dashboardPresets, ({ one }) => ({
    user: one(users_1.users, { fields: [exports.dashboardPresets.userId], references: [users_1.users.id] }),
    workspace: one(workspaces_1.workspaces, { fields: [exports.dashboardPresets.workspaceId], references: [workspaces_1.workspaces.id] }),
}));
//# sourceMappingURL=dashboard-presets.js.map