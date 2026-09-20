"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectMembersRelations = exports.projectMembers = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const projects_1 = require("./projects");
const users_1 = require("./users");
const enums_1 = require("./enums");
/**
 * Explicit membership of a Project. Only load-bearing when the project (or its
 * owning space) is 'private'. The project creator is seeded as an 'admin'
 * member (migration 0035).
 */
exports.projectMembers = (0, pg_core_1.pgTable)('project_members', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    projectId: (0, pg_core_1.uuid)('project_id').notNull().references(() => projects_1.projects.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    role: (0, enums_1.containerRoleEnum)('role').notNull().default('edit'),
    addedById: (0, pg_core_1.uuid)('added_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_project_members_project_user').on(t.projectId, t.userId),
    (0, pg_core_1.index)('idx_project_members_project').on(t.projectId),
    (0, pg_core_1.index)('idx_project_members_user').on(t.userId),
]);
exports.projectMembersRelations = (0, drizzle_orm_1.relations)(exports.projectMembers, ({ one }) => ({
    project: one(projects_1.projects, { fields: [exports.projectMembers.projectId], references: [projects_1.projects.id] }),
    user: one(users_1.users, { fields: [exports.projectMembers.userId], references: [users_1.users.id] }),
}));
//# sourceMappingURL=project-members.js.map