"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scimTokensRelations = exports.scimTokens = exports.ssoLoginStates = exports.ssoConnectionsRelations = exports.ssoConnections = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
exports.ssoConnections = (0, pg_core_1.pgTable)('sso_connections', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    provider: (0, pg_core_1.text)('provider').notNull().$type(),
    displayName: (0, pg_core_1.text)('display_name').notNull(), // e.g. "Okta", "Azure AD"
    isEnabled: (0, pg_core_1.boolean)('is_enabled').notNull().default(false),
    enforceForDomain: (0, pg_core_1.text)('enforce_for_domain'), // if set, users at this domain MUST use SSO
    jitProvisioning: (0, pg_core_1.boolean)('jit_provisioning').notNull().default(true),
    defaultRole: (0, pg_core_1.text)('default_role').notNull().default('member'),
    // OIDC config
    oidcIssuer: (0, pg_core_1.text)('oidc_issuer'),
    oidcClientId: (0, pg_core_1.text)('oidc_client_id'),
    oidcClientSecret: (0, pg_core_1.text)('oidc_client_secret'),
    oidcScopes: (0, pg_core_1.text)('oidc_scopes').default('openid email profile'),
    // SAML config
    samlIdpEntityId: (0, pg_core_1.text)('saml_idp_entity_id'),
    samlIdpSsoUrl: (0, pg_core_1.text)('saml_idp_sso_url'),
    samlIdpCertificate: (0, pg_core_1.text)('saml_idp_certificate'), // PEM
    samlSpEntityId: (0, pg_core_1.text)('saml_sp_entity_id'),
    samlSignRequests: (0, pg_core_1.boolean)('saml_sign_requests').notNull().default(false),
    // Attribute mapping (claim name → user field)
    attributeMapping: (0, pg_core_1.jsonb)('attribute_mapping').$type().default({}),
    lastUsedAt: (0, pg_core_1.timestamp)('last_used_at', { withTimezone: true }),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_sso_connection_workspace_provider').on(t.workspaceId, t.provider),
    (0, pg_core_1.index)('idx_sso_connection_workspace').on(t.workspaceId),
]);
exports.ssoConnectionsRelations = (0, drizzle_orm_1.relations)(exports.ssoConnections, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.ssoConnections.workspaceId], references: [workspaces_1.workspaces.id] }),
    createdBy: one(users_1.users, { fields: [exports.ssoConnections.createdById], references: [users_1.users.id] }),
}));
// ─── SSO Login State (CSRF / nonce store for the redirect dance) ────────────
exports.ssoLoginStates = (0, pg_core_1.pgTable)('sso_login_states', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    connectionId: (0, pg_core_1.uuid)('connection_id').notNull().references(() => exports.ssoConnections.id, { onDelete: 'cascade' }),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    state: (0, pg_core_1.text)('state').notNull().unique(),
    nonce: (0, pg_core_1.text)('nonce'),
    codeVerifier: (0, pg_core_1.text)('code_verifier'),
    redirectTo: (0, pg_core_1.text)('redirect_to'),
    expiresAt: (0, pg_core_1.timestamp)('expires_at', { withTimezone: true }).notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [(0, pg_core_1.index)('idx_sso_login_state_expires').on(t.expiresAt)]);
// ─── SCIM 2.0 Tokens ────────────────────────────────────────────────────────
exports.scimTokens = (0, pg_core_1.pgTable)('scim_tokens', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    tokenHash: (0, pg_core_1.text)('token_hash').notNull().unique(),
    keyPrefix: (0, pg_core_1.text)('key_prefix').notNull(), // first 8 chars, for display
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    lastUsedAt: (0, pg_core_1.timestamp)('last_used_at', { withTimezone: true }),
    expiresAt: (0, pg_core_1.timestamp)('expires_at', { withTimezone: true }),
    revokedAt: (0, pg_core_1.timestamp)('revoked_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [(0, pg_core_1.index)('idx_scim_token_workspace').on(t.workspaceId)]);
exports.scimTokensRelations = (0, drizzle_orm_1.relations)(exports.scimTokens, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.scimTokens.workspaceId], references: [workspaces_1.workspaces.id] }),
    createdBy: one(users_1.users, { fields: [exports.scimTokens.createdById], references: [users_1.users.id] }),
}));
//# sourceMappingURL=sso.js.map