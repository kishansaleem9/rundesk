import { pgTable, text, timestamp, uuid, boolean, integer, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'
import { workspaces } from './workspaces'

// ─── 2FA / TOTP ───────────────────────────────────────────────────────────────

export const userTotpSecrets = pgTable('user_totp_secrets', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  secret:      text('secret').notNull(),            // base32 TOTP secret (encrypted at rest)
  verified:    boolean('verified').notNull().default(false), // false until user verifies first code
  backupCodes: jsonb('backup_codes').$type<string[]>().default([]), // hashed backup codes
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  verifiedAt:  timestamp('verified_at', { withTimezone: true }),
})

// ─── API Keys ─────────────────────────────────────────────────────────────────

export const apiKeys = pgTable('api_keys', {
  id:          uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  name:        text('name').notNull(),
  // key is stored as hash; prefix shown to user (e.g. rd_live_xxxx)
  keyHash:     text('key_hash').notNull().unique(),
  keyPrefix:   text('key_prefix').notNull(),  // e.g. "rd_xxxx" (first 8 chars)
  scope:       text('scope').notNull().default('read_write'), // read_only | read_write | admin
  lastUsedAt:  timestamp('last_used_at', { withTimezone: true }),
  requestCount: integer('request_count').notNull().default(0),
  isRevoked:   boolean('is_revoked').notNull().default(false),
  expiresAt:   timestamp('expires_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_api_keys_workspace').on(t.workspaceId),
])

// ─── Audit Trail ─────────────────────────────────────────────────────────────

export const auditLogs = pgTable('audit_logs', {
  id:          uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  actorId:     uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  actorEmail:  text('actor_email'),
  // Action categories: auth.login | member.invited | member.removed | role.changed |
  //                    workspace.updated | feature_flag.changed | data.exported | api_key.created | api_key.revoked
  action:      text('action').notNull(),
  resourceType: text('resource_type'),
  resourceId:  text('resource_id'),
  description: text('description').notNull(),
  metadata:    jsonb('metadata').$type<Record<string, string | number | boolean | null>>(),
  ipAddress:   text('ip_address'),
  userAgent:   text('user_agent'),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_audit_logs_workspace').on(t.workspaceId, t.createdAt),
  index('idx_audit_logs_actor').on(t.actorId),
])

// ─── Relations ────────────────────────────────────────────────────────────────

export const userTotpSecretsRelations = relations(userTotpSecrets, ({ one }) => ({
  user: one(users, { fields: [userTotpSecrets.userId], references: [users.id] }),
}))

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  workspace: one(workspaces, { fields: [apiKeys.workspaceId], references: [workspaces.id] }),
  createdBy: one(users, { fields: [apiKeys.createdById], references: [users.id] }),
}))

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  workspace: one(workspaces, { fields: [auditLogs.workspaceId], references: [workspaces.id] }),
  actor: one(users, { fields: [auditLogs.actorId], references: [users.id] }),
}))
