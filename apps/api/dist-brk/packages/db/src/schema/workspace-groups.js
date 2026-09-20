"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspaceGroupMembersRelations = exports.workspaceGroupsRelations = exports.workspaceMemberProfilesRelations = exports.workspaceMemberProfiles = exports.workspaceGroupMembers = exports.workspaceGroups = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
// ─── Workspace Groups (a.k.a. "Teams") ──────────────────────────────────────
//
// SCIM 2.0 Groups map to this table. They are workspace-scoped collections
// of users that admins can use to assign tasks, route notifications, and
// receive group sync from IdPs (Okta, Azure AD, etc.) over SCIM.
//
// Membership is tracked independently from `workspace_members` so that a
// user can be in multiple groups, and so SCIM can sync groups without
// touching the workspace-member-level role/capacity columns.
exports.workspaceGroups = (0, pg_core_1.pgTable)('workspace_groups', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    /**
     * §A4.3 @-mention handle, unique per workspace (case-insensitively, via the
     * partial index in 0090). Kept separate from `name` so renaming a team never
     * invalidates the handle every past message addressed it by.
     */
    alias: (0, pg_core_1.text)('alias'),
    /** SCIM external ID (provided by the IdP for re-identification) */
    externalId: (0, pg_core_1.text)('external_id'),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_workspace_groups_workspace_name').on(t.workspaceId, t.name),
    (0, pg_core_1.index)('idx_workspace_groups_workspace').on(t.workspaceId),
    (0, pg_core_1.index)('idx_workspace_groups_external').on(t.workspaceId, t.externalId),
]);
exports.workspaceGroupMembers = (0, pg_core_1.pgTable)('workspace_group_members', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    groupId: (0, pg_core_1.uuid)('group_id').notNull().references(() => exports.workspaceGroups.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    addedAt: (0, pg_core_1.timestamp)('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_workspace_group_members_group_user').on(t.groupId, t.userId),
    (0, pg_core_1.index)('idx_workspace_group_members_user').on(t.userId),
]);
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
exports.workspaceMemberProfiles = (0, pg_core_1.pgTable)('workspace_member_profiles', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    /** Free text — "UI designer" is not an enum, and a picker of job titles would be wrong everywhere. */
    jobTitle: (0, pg_core_1.text)('job_title'),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_workspace_member_profiles_workspace_user').on(t.workspaceId, t.userId),
    (0, pg_core_1.index)('idx_workspace_member_profiles_workspace').on(t.workspaceId),
]);
exports.workspaceMemberProfilesRelations = (0, drizzle_orm_1.relations)(exports.workspaceMemberProfiles, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.workspaceMemberProfiles.workspaceId], references: [workspaces_1.workspaces.id] }),
    user: one(users_1.users, { fields: [exports.workspaceMemberProfiles.userId], references: [users_1.users.id] }),
}));
exports.workspaceGroupsRelations = (0, drizzle_orm_1.relations)(exports.workspaceGroups, ({ one, many }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.workspaceGroups.workspaceId], references: [workspaces_1.workspaces.id] }),
    createdBy: one(users_1.users, { fields: [exports.workspaceGroups.createdById], references: [users_1.users.id] }),
    members: many(exports.workspaceGroupMembers),
}));
exports.workspaceGroupMembersRelations = (0, drizzle_orm_1.relations)(exports.workspaceGroupMembers, ({ one }) => ({
    group: one(exports.workspaceGroups, { fields: [exports.workspaceGroupMembers.groupId], references: [exports.workspaceGroups.id] }),
    user: one(users_1.users, { fields: [exports.workspaceGroupMembers.userId], references: [users_1.users.id] }),
}));
//# sourceMappingURL=workspace-groups.js.map