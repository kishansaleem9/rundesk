import { pgTable, text, timestamp, boolean, uuid, unique, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { flagScopeEnum } from './enums'
import { workspaces } from './workspaces'
import { users } from './users'

// One row per flag override. Global scope has scopeId = null.
// Resolution order: user > role > workspace > global
export const featureFlags = pgTable('feature_flags', {
  id:          uuid('id').primaryKey().defaultRandom(),
  flagKey:     text('flag_key').notNull(),
  scope:       flagScopeEnum('scope').notNull(),
  scopeId:     text('scope_id'),  // userId | workspaceId | roleName | null (global)
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  enabled:     boolean('enabled').notNull(),
  updatedBy:   text('updated_by'),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('uq_flag_scope').on(t.flagKey, t.scope, t.scopeId, t.workspaceId),
])

export const flagAuditLog = pgTable('flag_audit_log', {
  id:          uuid('id').primaryKey().defaultRandom(),
  flagKey:     text('flag_key').notNull(),
  scope:       flagScopeEnum('scope').notNull(),
  scopeId:     text('scope_id'),
  workspaceId: uuid('workspace_id'),
  fromEnabled: boolean('from_enabled'),
  toEnabled:   boolean('to_enabled').notNull(),
  changedBy:   uuid('changed_by').notNull(),
  changedAt:   timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  ipAddress:   text('ip_address'),
})

/**
 * §2.2 — "somebody asked for this feature", recorded once per press.
 *
 * The once-a-day rule used to be read off the `notifications` table: if this
 * requester had produced an access_requested row for this flag in the last
 * day, the ask was a repeat. That row is only written for an admin who has an
 * in-app channel switched on, so a workspace whose admins run email-only
 * produced no row and the rule never tripped — the same press could mail every
 * admin again and again.
 *
 * The ask is its own fact and does not depend on how anybody chose to be told
 * about it, so it is recorded as one.
 */
export const featureFlagRequests = pgTable('feature_flag_requests', {
  id:          uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  flagKey:     text('flag_key').notNull(),
  requesterId: uuid('requester_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // The only way this is read: "has this person asked for this flag lately".
  index('feature_flag_requests_recent_idx').on(t.workspaceId, t.flagKey, t.requesterId, t.createdAt),
])

export const featureFlagsRelations = relations(featureFlags, ({ one }) => ({
  workspace: one(workspaces, { fields: [featureFlags.workspaceId], references: [workspaces.id] }),
}))
