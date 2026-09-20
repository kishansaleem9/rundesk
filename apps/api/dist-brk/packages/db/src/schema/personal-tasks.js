"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.personalTasksRelations = exports.personalTasks = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const users_1 = require("./users");
const workspaces_1 = require("./workspaces");
/**
 * A private per-user to-do list, scoped to a workspace. These are the user's
 * own personal cards (distinct from shared workspace tasks) shown under
 * Home → Personal List. Rows are keyed to the owning user, so they are only
 * ever visible to that user.
 */
exports.personalTasks = (0, pg_core_1.pgTable)('personal_tasks', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    title: (0, pg_core_1.text)('title').notNull(),
    done: (0, pg_core_1.boolean)('done').notNull().default(false),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.index)('idx_personal_tasks_user_ws').on(t.userId, t.workspaceId),
]);
exports.personalTasksRelations = (0, drizzle_orm_1.relations)(exports.personalTasks, ({ one }) => ({
    user: one(users_1.users, { fields: [exports.personalTasks.userId], references: [users_1.users.id] }),
    workspace: one(workspaces_1.workspaces, { fields: [exports.personalTasks.workspaceId], references: [workspaces_1.workspaces.id] }),
}));
//# sourceMappingURL=personal-tasks.js.map