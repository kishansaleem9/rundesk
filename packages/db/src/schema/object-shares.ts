import { pgTable, text, timestamp, uuid, index, uniqueIndex, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'
import { containerRoleEnum } from './enums'

/**
 * Share & Permissions — a single grant table for every shareable object, so a
 * folder / list / task / doc is shared the same way a space or project is, and
 * an outsider can be invited by email before they have a user row.
 *
 * Exactly one of `userId` / `invitedEmail` is set (enforced by a CHECK in
 * migration 0085). `level` reuses container_role: admin (full edit), edit,
 * comment, view. Resolution is most-specific-wins, done in the API.
 */
export const objectShares = pgTable(
  'object_shares',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    workspaceId:  uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    // 'view' is §V2-07's "Sharing & Permissions" on a saved view (frames 10:36
    // and 11:14) — a view is shared like anything else rather than through a
    // second mechanism of its own.
    objectType:   text('object_type').$type<'space' | 'folder' | 'project' | 'list' | 'task' | 'doc' | 'channel' | 'dashboard' | 'view'>().notNull(),
    objectId:     uuid('object_id').notNull(),
    userId:       uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    invitedEmail: text('invited_email'),
    level:        containerRoleEnum('level').notNull().default('view'),
    createdById:  uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_object_shares_object').on(t.objectType, t.objectId),
    index('idx_object_shares_user').on(t.userId),
    index('idx_object_shares_ws').on(t.workspaceId),
    uniqueIndex('uq_object_shares_user').on(t.objectType, t.objectId, t.userId),
    // Made by 0085. Declared here as well: a database built by
    // `drizzle-kit push` (the lanes, CI, a fresh deploy) reads only this file.
    uniqueIndex('uq_object_shares_email').on(t.objectType, t.objectId, sql`lower(${t.invitedEmail})`).where(sql`${t.invitedEmail} IS NOT NULL`),
    index('idx_object_shares_email').on(sql`lower(${t.invitedEmail})`),
    check('object_shares_principal_check', sql`(${t.userId} IS NOT NULL) <> (${t.invitedEmail} IS NOT NULL)`),
  ],
)
