import { pgTable, text, timestamp, uuid, jsonb, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { invitationStatusEnum, orgRoleEnum, userRoleEnum } from './enums'
import { organizations } from './workspaces'
import { users } from './users'

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
export const invitations = pgTable(
  'invitations',
  {
    id:               uuid('id').primaryKey().defaultRandom(),
    organizationId:   uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email:            text('email').notNull(),
    orgRole:          orgRoleEnum('org_role').notNull().default('member'),
    /**
     * Workspaces this invite grants access to. Empty array means the invite
     * is org-only (the user can later be added to workspaces by an admin).
     * Shape: Array<{ workspaceId: string; role: UserRole }>
     */
    workspaceMemberships: jsonb('workspace_memberships')
      .$type<Array<{ workspaceId: string; role: 'super_admin' | 'workspace_admin' | 'manager' | 'member' | 'guest' }>>()
      .notNull()
      .default([]),
    invitedByUserId:  uuid('invited_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token:            text('token').notNull().unique(),
    status:           invitationStatusEnum('status').notNull().default('pending'),
    expiresAt:        timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt:       timestamp('accepted_at', { withTimezone: true }),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    /**
     * Block duplicate pending invites for the same (org, email) pair.
     * Once an invite is accepted/revoked/expired, a new pending one is allowed.
     */
    pendingPerOrgEmail: uniqueIndex('idx_invitations_org_email_pending')
      .on(t.organizationId, t.email)
      .where(sql`${t.status} = 'pending'`),
  }),
)

export const invitationsRelations = relations(invitations, ({ one }) => ({
  organization: one(organizations, {
    fields:     [invitations.organizationId],
    references: [organizations.id],
  }),
  invitedBy:    one(users, {
    fields:     [invitations.invitedByUserId],
    references: [users.id],
    relationName: 'invitedBy',
  }),
  acceptedBy:   one(users, {
    fields:     [invitations.acceptedByUserId],
    references: [users.id],
    relationName: 'acceptedBy',
  }),
}))
