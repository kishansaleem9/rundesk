import { pgTable, text, timestamp, boolean, uuid, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { flagScopeEnum } from './enums'
import { workspaces } from './workspaces'

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

export const featureFlagsRelations = relations(featureFlags, ({ one }) => ({
  workspace: one(workspaces, { fields: [featureFlags.workspaceId], references: [workspaces.id] }),
}))
