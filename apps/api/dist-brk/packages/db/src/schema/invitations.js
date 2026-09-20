"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invitationsRelations = exports.invitations = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const enums_1 = require("./enums");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
/**
 * Pending workspace invitations sent by org admins.
 *
 * One invite is **organization-scoped**: it grants org membership at the chosen
 * `orgRole` and optionally adds the user to N workspaces with their respective
 * roles (encoded in `workspaceMemberships`). On acceptance, the corresponding
 * `organization_members` row + N `workspace_members` rows are created in a
 * single transaction.
 *
 * Tokens are random URL-safe strings (32 bytes, base64url) — never derived
 * from email/timestamp. Single-use enforcement happens via the
 * `WHERE status = 'pending'` guard on the claim transaction.
 */
exports.invitations = (0, pg_core_1.pgTable)('invitations', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    organizationId: (0, pg_core_1.uuid)('organization_id')
        .notNull()
        .references(() => workspaces_1.organizations.id, { onDelete: 'cascade' }),
    email: (0, pg_core_1.text)('email').notNull(),
    orgRole: (0, enums_1.orgRoleEnum)('org_role').notNull().default('member'),
    /**
     * Workspaces this invite grants access to. Empty array means the invite
     * is org-only (the user can later be added to workspaces by an admin).
     * Shape: Array<{ workspaceId: string; role: UserRole }>
     */
    workspaceMemberships: (0, pg_core_1.jsonb)('workspace_memberships')
        .$type()
        .notNull()
        .default([]),
    invitedByUserId: (0, pg_core_1.uuid)('invited_by_user_id')
        .notNull()
        .references(() => users_1.users.id, { onDelete: 'cascade' }),
    token: (0, pg_core_1.text)('token').notNull().unique(),
    status: (0, enums_1.invitationStatusEnum)('status').notNull().default('pending'),
    expiresAt: (0, pg_core_1.timestamp)('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: (0, pg_core_1.timestamp)('accepted_at', { withTimezone: true }),
    acceptedByUserId: (0, pg_core_1.uuid)('accepted_by_user_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    /**
     * Block duplicate pending invites for the same (org, email) pair.
     * Once an invite is accepted/revoked/expired, a new pending one is allowed.
     */
    pendingPerOrgEmail: (0, pg_core_1.uniqueIndex)('idx_invitations_org_email_pending')
        .on(t.organizationId, t.email)
        .where((0, drizzle_orm_1.sql) `${t.status} = 'pending'`),
}));
exports.invitationsRelations = (0, drizzle_orm_1.relations)(exports.invitations, ({ one }) => ({
    organization: one(workspaces_1.organizations, {
        fields: [exports.invitations.organizationId],
        references: [workspaces_1.organizations.id],
    }),
    invitedBy: one(users_1.users, {
        fields: [exports.invitations.invitedByUserId],
        references: [users_1.users.id],
        relationName: 'invitedBy',
    }),
    acceptedBy: one(users_1.users, {
        fields: [exports.invitations.acceptedByUserId],
        references: [users_1.users.id],
        relationName: 'acceptedBy',
    }),
}));
//# sourceMappingURL=invitations.js.map