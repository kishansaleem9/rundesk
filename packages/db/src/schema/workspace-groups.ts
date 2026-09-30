import { pgTable, text, timestamp, uuid, unique, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
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
    // Made by 0090. Declared here as well: a database built by
    // `drizzle-kit push` (the lanes, CI, a fresh deploy) reads only this file.
    uniqueIndex('uq_workspace_groups_alias').on(t.workspaceId, sql`lower(${t.alias})`).where(sql`${t.alias} IS NOT NULL`),
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

/**
 * §V2-12 / frame `21:00` — what a person card says underneath the name.
 *
 * The Teams Hub person previews are "Priya Gupta / UI designer", "Sarah Chang /
 * Software Engineer", "Mei Chen / Cloud Solutions Architect", "Ryan Johnson /
 * DevOps Engineer" — a NAME and a JOB TITLE, then that person's current work.
 * Rundesk stored neither: `users` has displayName/bio/timezone and no title,
 * and `workspace_members.role` is a PERMISSION (`workspace_admin`, `member`,
 * `guest`), not a job. Rendering the permission where the frame draws the job
 * would put "member" under four different people and call it their role.
 *
 * Per WORKSPACE, not per user, for the same reason group membership is: the
 * same person is a contractor in one workspace and a lead in another, and one
 * global string would leak the first workspace's answer into the second.
 *
 * Kept out of `workspace_members` deliberately, mirroring the note above about
 * SCIM: that table's columns are role/capacity/manager, written by the
 * membership and IdP-sync paths. Display metadata that anybody may edit about
 * themselves does not belong in rows an IdP overwrites.
 */
export const workspaceMemberProfiles = pgTable(
  'workspace_member_profiles',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** Free text — "UI designer" is not an enum, and a picker of job titles would be wrong everywhere. */
    jobTitle:    text('job_title'),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_workspace_member_profiles_workspace_user').on(t.workspaceId, t.userId),
    index('idx_workspace_member_profiles_workspace').on(t.workspaceId),
  ],
)

export const workspaceMemberProfilesRelations = relations(workspaceMemberProfiles, ({ one }) => ({
  workspace: one(workspaces, { fields: [workspaceMemberProfiles.workspaceId], references: [workspaces.id] }),
  user:      one(users, { fields: [workspaceMemberProfiles.userId], references: [users.id] }),
}))

export const workspaceGroupsRelations = relations(workspaceGroups, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [workspaceGroups.workspaceId], references: [workspaces.id] }),
  createdBy: one(users, { fields: [workspaceGroups.createdById], references: [users.id] }),
  members:   many(workspaceGroupMembers),
}))

export const workspaceGroupMembersRelations = relations(workspaceGroupMembers, ({ one }) => ({
  group: one(workspaceGroups, { fields: [workspaceGroupMembers.groupId], references: [workspaceGroups.id] }),
  user:  one(users, { fields: [workspaceGroupMembers.userId], references: [users.id] }),
}))
