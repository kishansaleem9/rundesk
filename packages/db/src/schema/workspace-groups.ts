import { pgTable, text, timestamp, uuid, unique, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

// ─── Workspace Groups (a.k.a. "Teams") ──────────────────────────────────────
//
// SCIM 2.0 Groups map to this table. They are workspace-scoped collections
// of users that admins can use to assign tasks, route notifications, and
// receive group sync from IdPs (Okta, Azure AD, etc.) over SCIM.
//
// Membership is tracked independently from `workspace_members` so that a
// user can be in multiple groups, and so SCIM can sync groups without
// touching the workspace-member-level role/capacity columns.

export const workspaceGroups = pgTable(
  'workspace_groups',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    name:        text('name').notNull(),
    description: text('description'),
    /**
     * §A4.3 @-mention handle, unique per workspace (case-insensitively, via the
     * partial index in 0090). Kept separate from `name` so renaming a team never
     * invalidates the handle every past message addressed it by.
     */
    alias:       text('alias'),
    /** SCIM external ID (provided by the IdP for re-identification) */
    externalId:  text('external_id'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_workspace_groups_workspace_name').on(t.workspaceId, t.name),
    index('idx_workspace_groups_workspace').on(t.workspaceId),
    index('idx_workspace_groups_external').on(t.workspaceId, t.externalId),
  ],
)

export const workspaceGroupMembers = pgTable(
  'workspace_group_members',
  {
    id:       uuid('id').primaryKey().defaultRandom(),
    groupId:  uuid('group_id').notNull().references(() => workspaceGroups.id, { onDelete: 'cascade' }),
    userId:   uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    addedAt:  timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_workspace_group_members_group_user').on(t.groupId, t.userId),
    index('idx_workspace_group_members_user').on(t.userId),
  ],
)

export const workspaceGroupsRelations = relations(workspaceGroups, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [workspaceGroups.workspaceId], references: [workspaces.id] }),
  createdBy: one(users, { fields: [workspaceGroups.createdById], references: [users.id] }),
  members:   many(workspaceGroupMembers),
}))

export const workspaceGroupMembersRelations = relations(workspaceGroupMembers, ({ one }) => ({
  group: one(workspaceGroups, { fields: [workspaceGroupMembers.groupId], references: [workspaceGroups.id] }),
  user:  one(users, { fields: [workspaceGroupMembers.userId], references: [users.id] }),
}))
