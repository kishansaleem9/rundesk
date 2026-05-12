import { pgTable, text, timestamp, uuid, boolean, jsonb, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

// ─── SSO Connections ────────────────────────────────────────────────────────
//
// One row per workspace, per provider type. A workspace can have at most one
// OIDC and one SAML connection configured.

export type SsoProvider = 'oidc' | 'saml'

export const ssoConnections = pgTable(
  'sso_connections',
  {
    id:               uuid('id').primaryKey().defaultRandom(),
    workspaceId:      uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    provider:         text('provider').notNull().$type<SsoProvider>(),
    displayName:      text('display_name').notNull(), // e.g. "Okta", "Azure AD"
    isEnabled:        boolean('is_enabled').notNull().default(false),
    enforceForDomain: text('enforce_for_domain'),       // if set, users at this domain MUST use SSO
    jitProvisioning:  boolean('jit_provisioning').notNull().default(true),
    defaultRole:      text('default_role').notNull().default('member'),

    // OIDC config
    oidcIssuer:       text('oidc_issuer'),
    oidcClientId:     text('oidc_client_id'),
    oidcClientSecret: text('oidc_client_secret'),
    oidcScopes:       text('oidc_scopes').default('openid email profile'),

    // SAML config
    samlIdpEntityId:   text('saml_idp_entity_id'),
    samlIdpSsoUrl:     text('saml_idp_sso_url'),
    samlIdpCertificate: text('saml_idp_certificate'), // PEM
    samlSpEntityId:    text('saml_sp_entity_id'),
    samlSignRequests:  boolean('saml_sign_requests').notNull().default(false),

    // Attribute mapping (claim name → user field)
    attributeMapping: jsonb('attribute_mapping').$type<{
      email?: string
      displayName?: string
      groups?: string
    }>().default({}),

    lastUsedAt:       timestamp('last_used_at', { withTimezone: true }),
    createdById:      uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_sso_connection_workspace_provider').on(t.workspaceId, t.provider),
    index('idx_sso_connection_workspace').on(t.workspaceId),
  ],
)

export const ssoConnectionsRelations = relations(ssoConnections, ({ one }) => ({
  workspace: one(workspaces, { fields: [ssoConnections.workspaceId], references: [workspaces.id] }),
  createdBy: one(users, { fields: [ssoConnections.createdById], references: [users.id] }),
}))

// ─── SSO Login State (CSRF / nonce store for the redirect dance) ────────────

export const ssoLoginStates = pgTable(
  'sso_login_states',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    connectionId: uuid('connection_id').notNull().references(() => ssoConnections.id, { onDelete: 'cascade' }),
    workspaceId:  uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    state:        text('state').notNull().unique(),
    nonce:        text('nonce'),
    codeVerifier: text('code_verifier'),
    redirectTo:   text('redirect_to'),
    expiresAt:    timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_sso_login_state_expires').on(t.expiresAt)],
)

// ─── SCIM 2.0 Tokens ────────────────────────────────────────────────────────

export const scimTokens = pgTable(
  'scim_tokens',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    workspaceId:  uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    name:         text('name').notNull(),
    tokenHash:    text('token_hash').notNull().unique(),
    keyPrefix:    text('key_prefix').notNull(), // first 8 chars, for display
    createdById:  uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    lastUsedAt:   timestamp('last_used_at', { withTimezone: true }),
    expiresAt:    timestamp('expires_at', { withTimezone: true }),
    revokedAt:    timestamp('revoked_at', { withTimezone: true }),
    createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_scim_token_workspace').on(t.workspaceId)],
)

export const scimTokensRelations = relations(scimTokens, ({ one }) => ({
  workspace: one(workspaces, { fields: [scimTokens.workspaceId], references: [workspaces.id] }),
  createdBy: one(users, { fields: [scimTokens.createdById], references: [users.id] }),
}))
