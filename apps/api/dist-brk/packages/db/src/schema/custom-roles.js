"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspaceMemberCustomRolesRelations = exports.customRolePermissionsRelations = exports.customRolesRelations = exports.workspaceMemberCustomRoles = exports.customRolePermissions = exports.customRoles = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
/**
 * A custom role is an admin-defined permission bundle scoped to a workspace.
 * It augments the legacy 4-role model (`admin`/`manager`/`member`/`guest`)
 * — assigning a custom role to a member adds its permissions on top of
 * whatever their legacy role already grants.
 *
 * `baseRole` is the floor — a custom role can never drop a member below
 * their legacy role's permissions, only add more. `isLocked` flags the
 * seeded "Admin" / "Member" / "Guest" presets so they can't be renamed
 * or deleted by accident.
 */
exports.customRoles = (0, pg_core_1.pgTable)('custom_roles', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    color: (0, pg_core_1.text)('color').notNull().default('#64748b'),
    isLocked: (0, pg_core_1.boolean)('is_locked').notNull().default(false),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_custom_roles_workspace_name').on(t.workspaceId, t.name),
    (0, pg_core_1.index)('idx_custom_roles_workspace_position').on(t.workspaceId, t.position),
]);
/**
 * One permission key granted by a role. The permission strings are owned
 * by the API's permission catalog (see permission-catalog.ts) — the DB
 * accepts free text so we can ship new permissions without a migration.
 */
exports.customRolePermissions = (0, pg_core_1.pgTable)('custom_role_permissions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    roleId: (0, pg_core_1.uuid)('role_id').notNull().references(() => exports.customRoles.id, { onDelete: 'cascade' }),
    permission: (0, pg_core_1.text)('permission').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_custom_role_permissions_role_permission').on(t.roleId, t.permission),
    (0, pg_core_1.index)('idx_custom_role_permissions_permission').on(t.permission),
]);
/**
 * Many-to-many link: a workspace member can hold multiple custom roles,
 * and their effective permission set is the union of all assigned roles
 * plus whatever the legacy role grants.
 */
exports.workspaceMemberCustomRoles = (0, pg_core_1.pgTable)('workspace_member_custom_roles', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceMemberId: (0, pg_core_1.uuid)('workspace_member_id').notNull().references(() => workspaces_1.workspaceMembers.id, { onDelete: 'cascade' }),
    roleId: (0, pg_core_1.uuid)('role_id').notNull().references(() => exports.customRoles.id, { onDelete: 'cascade' }),
    assignedById: (0, pg_core_1.uuid)('assigned_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    assignedAt: (0, pg_core_1.timestamp)('assigned_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_workspace_member_custom_roles_member_role').on(t.workspaceMemberId, t.roleId),
    (0, pg_core_1.index)('idx_workspace_member_custom_roles_member').on(t.workspaceMemberId),
]);
exports.customRolesRelations = (0, drizzle_orm_1.relations)(exports.customRoles, ({ one, many }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.customRoles.workspaceId], references: [workspaces_1.workspaces.id] }),
    createdBy: one(users_1.users, { fields: [exports.customRoles.createdById], references: [users_1.users.id] }),
    permissions: many(exports.customRolePermissions),
    assignments: many(exports.workspaceMemberCustomRoles),
}));
exports.customRolePermissionsRelations = (0, drizzle_orm_1.relations)(exports.customRolePermissions, ({ one }) => ({
    role: one(exports.customRoles, { fields: [exports.customRolePermissions.roleId], references: [exports.customRoles.id] }),
}));
exports.workspaceMemberCustomRolesRelations = (0, drizzle_orm_1.relations)(exports.workspaceMemberCustomRoles, ({ one }) => ({
    role: one(exports.customRoles, { fields: [exports.workspaceMemberCustomRoles.roleId], references: [exports.customRoles.id] }),
    member: one(workspaces_1.workspaceMembers, { fields: [exports.workspaceMemberCustomRoles.workspaceMemberId], references: [workspaces_1.workspaceMembers.id] }),
}));
//# sourceMappingURL=custom-roles.js.map