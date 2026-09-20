"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLogsRelations = exports.apiKeysRelations = exports.userTotpSecretsRelations = exports.workspaceSecuritySettingsRelations = exports.workspaceSecuritySettings = exports.auditLogs = exports.apiKeys = exports.userTotpSecrets = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const users_1 = require("./users");
const workspaces_1 = require("./workspaces");
// ─── 2FA / TOTP ───────────────────────────────────────────────────────────────
exports.userTotpSecrets = (0, pg_core_1.pgTable)('user_totp_secrets', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id').notNull().unique().references(() => users_1.users.id, { onDelete: 'cascade' }),
    secret: (0, pg_core_1.text)('secret').notNull(), // base32 TOTP secret (encrypted at rest)
    verified: (0, pg_core_1.boolean)('verified').notNull().default(false), // false until user verifies first code
    backupCodes: (0, pg_core_1.jsonb)('backup_codes').$type().default([]), // hashed backup codes
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: (0, pg_core_1.timestamp)('verified_at', { withTimezone: true }),
});
// ─── API Keys ─────────────────────────────────────────────────────────────────
exports.apiKeys = (0, pg_core_1.pgTable)('api_keys', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    name: (0, pg_core_1.text)('name').notNull(),
    // key is stored as hash; prefix shown to user (e.g. rd_live_xxxx)
    keyHash: (0, pg_core_1.text)('key_hash').notNull().unique(),
    keyPrefix: (0, pg_core_1.text)('key_prefix').notNull(), // e.g. "rd_xxxx" (first 8 chars)
    scope: (0, pg_core_1.text)('scope').notNull().default('read_write'), // read_only | read_write | admin
    lastUsedAt: (0, pg_core_1.timestamp)('last_used_at', { withTimezone: true }),
    requestCount: (0, pg_core_1.integer)('request_count').notNull().default(0),
    isRevoked: (0, pg_core_1.boolean)('is_revoked').notNull().default(false),
    expiresAt: (0, pg_core_1.timestamp)('expires_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.index)('idx_api_keys_workspace').on(t.workspaceId),
]);
// ─── Audit Trail ─────────────────────────────────────────────────────────────
exports.auditLogs = (0, pg_core_1.pgTable)('audit_logs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    actorId: (0, pg_core_1.uuid)('actor_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    actorEmail: (0, pg_core_1.text)('actor_email'),
    // Action categories: auth.login | member.invited | member.removed | role.changed |
    //                    workspace.updated | feature_flag.changed | data.exported | api_key.created | api_key.revoked
    action: (0, pg_core_1.text)('action').notNull(),
    resourceType: (0, pg_core_1.text)('resource_type'),
    resourceId: (0, pg_core_1.text)('resource_id'),
    description: (0, pg_core_1.text)('description').notNull(),
    metadata: (0, pg_core_1.jsonb)('metadata').$type(),
    ipAddress: (0, pg_core_1.text)('ip_address'),
    userAgent: (0, pg_core_1.text)('user_agent'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.index)('idx_audit_logs_workspace').on(t.workspaceId, t.createdAt),
    (0, pg_core_1.index)('idx_audit_logs_actor').on(t.actorId),
]);
// ─── Workspace security settings ──────────────────────────────────────────────
// One row per workspace. All fields have safe defaults so an un-configured
// workspace behaves exactly as before (IP allowlist off, 7-day sessions,
// unlimited concurrent sessions). Enforcement lives in AuthService; this table
// is the source of truth the admin panel reads and writes.
exports.workspaceSecuritySettings = (0, pg_core_1.pgTable)('workspace_security_settings', {
    workspaceId: (0, pg_core_1.uuid)('workspace_id').primaryKey().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    // IP allowlist
    ipAllowlistEnabled: (0, pg_core_1.boolean)('ip_allowlist_enabled').notNull().default(false),
    ipAllowlist: (0, pg_core_1.jsonb)('ip_allowlist').$type().notNull().default([]), // IPv4/IPv6, plain or CIDR
    ipAllowlistIncludeAdmins: (0, pg_core_1.boolean)('ip_allowlist_include_admins').notNull().default(false), // admins exempt by default
    // Sessions
    sessionTimeoutMinutes: (0, pg_core_1.integer)('session_timeout_minutes').notNull().default(10080), // 7d — drives refresh-token lifetime
    maxConcurrentSessions: (0, pg_core_1.integer)('max_concurrent_sessions').notNull().default(0), // 0 = unlimited
    // Login policy
    lockoutEnabled: (0, pg_core_1.boolean)('lockout_enabled').notNull().default(true),
    lockoutThreshold: (0, pg_core_1.integer)('lockout_threshold').notNull().default(5),
    lockoutDurationMinutes: (0, pg_core_1.integer)('lockout_duration_minutes').notNull().default(30),
    requireStrongPasswords: (0, pg_core_1.boolean)('require_strong_passwords').notNull().default(true),
    blockBreachedPasswords: (0, pg_core_1.boolean)('block_breached_passwords').notNull().default(false), // haveibeenpwned (fail-open)
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedById: (0, pg_core_1.uuid)('updated_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
});
// ─── Relations ────────────────────────────────────────────────────────────────
exports.workspaceSecuritySettingsRelations = (0, drizzle_orm_1.relations)(exports.workspaceSecuritySettings, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.workspaceSecuritySettings.workspaceId], references: [workspaces_1.workspaces.id] }),
    updatedBy: one(users_1.users, { fields: [exports.workspaceSecuritySettings.updatedById], references: [users_1.users.id] }),
}));
exports.userTotpSecretsRelations = (0, drizzle_orm_1.relations)(exports.userTotpSecrets, ({ one }) => ({
    user: one(users_1.users, { fields: [exports.userTotpSecrets.userId], references: [users_1.users.id] }),
}));
exports.apiKeysRelations = (0, drizzle_orm_1.relations)(exports.apiKeys, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.apiKeys.workspaceId], references: [workspaces_1.workspaces.id] }),
    createdBy: one(users_1.users, { fields: [exports.apiKeys.createdById], references: [users_1.users.id] }),
}));
exports.auditLogsRelations = (0, drizzle_orm_1.relations)(exports.auditLogs, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.auditLogs.workspaceId], references: [workspaces_1.workspaces.id] }),
    actor: one(users_1.users, { fields: [exports.auditLogs.actorId], references: [users_1.users.id] }),
}));
//# sourceMappingURL=security.js.map