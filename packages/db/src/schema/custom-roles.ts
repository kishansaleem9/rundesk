import { pgTable, text, timestamp, uuid, boolean, integer, unique, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces, workspaceMembers } from './workspaces'
import { users } from './users'

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
export const customRoles = pgTable(
  'custom_roles',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    name:        text('name').notNull(),
    description: text('description'),
    color:       text('color').notNull().default('#64748b'),
    isLocked:    boolean('is_locked').notNull().default(false),
    position:    integer('position').notNull().default(0),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_custom_roles_workspace_name').on(t.workspaceId, t.name),
    index('idx_custom_roles_workspace_position').on(t.workspaceId, t.position),
  ],
)

/**
 * One permission key granted by a role. The permission strings are owned
 * by the API's permission catalog (see permission-catalog.ts) — the DB
 * accepts free text so we can ship new permissions without a migration.
 */
export const customRolePermissions = pgTable(
  'custom_role_permissions',
  {
    id:         uuid('id').primaryKey().defaultRandom(),
    roleId:     uuid('role_id').notNull().references(() => customRoles.id, { onDelete: 'cascade' }),
    permission: text('permission').notNull(),
    createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_custom_role_permissions_role_permission').on(t.roleId, t.permission),
    index('idx_custom_role_permissions_permission').on(t.permission),
  ],
)

/**
 * Many-to-many link: a workspace member can hold multiple custom roles,
 * and their effective permission set is the union of all assigned roles
 * plus whatever the legacy role grants.
 */
export const workspaceMemberCustomRoles = pgTable(
  'workspace_member_custom_roles',
  {
    id:                uuid('id').primaryKey().defaultRandom(),
    workspaceMemberId: uuid('workspace_member_id').notNull().references(() => workspaceMembers.id, { onDelete: 'cascade' }),
    roleId:            uuid('role_id').notNull().references(() => customRoles.id, { onDelete: 'cascade' }),
    assignedById:      uuid('assigned_by_id').references(() => users.id, { onDelete: 'set null' }),
    assignedAt:        timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_workspace_member_custom_roles_member_role').on(t.workspaceMemberId, t.roleId),
    index('idx_workspace_member_custom_roles_member').on(t.workspaceMemberId),
  ],
)

export const customRolesRelations = relations(customRoles, ({ one, many }) => ({
  workspace:   one(workspaces, { fields: [customRoles.workspaceId], references: [workspaces.id] }),
  createdBy:   one(users,      { fields: [customRoles.createdById], references: [users.id] }),
  permissions: many(customRolePermissions),
  assignments: many(workspaceMemberCustomRoles),
}))

export const customRolePermissionsRelations = relations(customRolePermissions, ({ one }) => ({
  role: one(customRoles, { fields: [customRolePermissions.roleId], references: [customRoles.id] }),
}))

export const workspaceMemberCustomRolesRelations = relations(workspaceMemberCustomRoles, ({ one }) => ({
  role:   one(customRoles,      { fields: [workspaceMemberCustomRoles.roleId],            references: [customRoles.id] }),
  member: one(workspaceMembers, { fields: [workspaceMemberCustomRoles.workspaceMemberId], references: [workspaceMembers.id] }),
}))
