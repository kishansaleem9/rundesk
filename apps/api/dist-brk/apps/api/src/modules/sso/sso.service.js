"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SsoService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const openidClient = __importStar(require("openid-client"));
const node_saml_1 = require("@node-saml/node-saml");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const security_service_1 = require("../security/security.service");
let SsoService = class SsoService {
    constructor(db, config, security) {
        this.db = db;
        this.config = config;
        this.security = security;
        this.appUrl = this.config.get('APP_URL') ?? 'http://localhost:5173';
    }
    // ─── Configuration CRUD ──────────────────────────────────────────────────
    async listConnections(workspaceId) {
        const rows = await this.db
            .select()
            .from(db_1.ssoConnections)
            .where((0, drizzle_orm_1.eq)(db_1.ssoConnections.workspaceId, workspaceId));
        return rows.map(this.sanitizeConnection);
    }
    async getConnectionByProvider(workspaceId, provider) {
        const [row] = await this.db
            .select()
            .from(db_1.ssoConnections)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.ssoConnections.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.ssoConnections.provider, provider)))
            .limit(1);
        return row ?? null;
    }
    async upsertConnection(workspaceId, provider, actorId, patch) {
        const existing = await this.getConnectionByProvider(workspaceId, provider);
        if (existing) {
            const [updated] = await this.db
                .update(db_1.ssoConnections)
                .set({ ...patch, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(db_1.ssoConnections.id, existing.id))
                .returning();
            await this.security.logAuditEvent({
                workspaceId,
                actorId,
                action: 'sso.connection_updated',
                resourceType: 'sso_connection',
                resourceId: existing.id,
                description: `Updated ${provider.toUpperCase()} SSO connection`,
                metadata: { provider, enabled: updated.isEnabled },
            });
            return this.sanitizeConnection(updated);
        }
        if (!patch.displayName) {
            throw new common_1.BadRequestException('displayName is required when creating a connection');
        }
        const [created] = await this.db
            .insert(db_1.ssoConnections)
            .values({
            workspaceId,
            provider,
            displayName: patch.displayName,
            createdById: actorId,
            ...patch,
        })
            .returning();
        await this.security.logAuditEvent({
            workspaceId,
            actorId,
            action: 'sso.connection_created',
            resourceType: 'sso_connection',
            resourceId: created.id,
            description: `Created ${provider.toUpperCase()} SSO connection "${created.displayName}"`,
            metadata: { provider },
        });
        return this.sanitizeConnection(created);
    }
    async deleteConnection(workspaceId, connectionId, actorId) {
        const [existing] = await this.db
            .select()
            .from(db_1.ssoConnections)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.ssoConnections.id, connectionId), (0, drizzle_orm_1.eq)(db_1.ssoConnections.workspaceId, workspaceId)))
            .limit(1);
        if (!existing)
            throw new common_1.NotFoundException('SSO connection not found');
        await this.db.delete(db_1.ssoConnections).where((0, drizzle_orm_1.eq)(db_1.ssoConnections.id, connectionId));
        await this.security.logAuditEvent({
            workspaceId,
            actorId,
            action: 'sso.connection_deleted',
            resourceType: 'sso_connection',
            resourceId: connectionId,
            description: `Deleted ${existing.provider.toUpperCase()} SSO connection "${existing.displayName}"`,
            metadata: { provider: existing.provider },
        });
        return { ok: true };
    }
    /**
     * Look up the SSO connection that should be used for a user based on their
     * email domain. Used by the sign-in page to decide whether to surface a
     * "Sign in with SSO" path.
     */
    async findConnectionForEmail(email) {
        const domain = email.split('@')[1]?.toLowerCase();
        if (!domain)
            return null;
        const candidates = await this.db
            .select()
            .from(db_1.ssoConnections)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.ssoConnections.enforceForDomain, domain), (0, drizzle_orm_1.eq)(db_1.ssoConnections.isEnabled, true)))
            .limit(1);
        return candidates[0] ?? null;
    }
    // ─── OIDC flow ────────────────────────────────────────────────────────────
    async beginOidcLogin(workspaceId, redirectTo) {
        const conn = await this.getConnectionByProvider(workspaceId, 'oidc');
        if (!conn || !conn.isEnabled)
            throw new common_1.NotFoundException('OIDC not configured for workspace');
        if (!conn.oidcIssuer || !conn.oidcClientId || !conn.oidcClientSecret) {
            throw new common_1.BadRequestException('OIDC connection is missing issuer/client credentials');
        }
        const config = await openidClient.discovery(new URL(conn.oidcIssuer), conn.oidcClientId, conn.oidcClientSecret);
        const state = (0, node_crypto_1.randomUUID)();
        const nonce = openidClient.randomNonce();
        const codeVerifier = openidClient.randomPKCECodeVerifier();
        const codeChallenge = await openidClient.calculatePKCECodeChallenge(codeVerifier);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await this.db.insert(db_1.ssoLoginStates).values({
            connectionId: conn.id,
            workspaceId,
            state,
            nonce,
            codeVerifier,
            redirectTo: redirectTo ?? null,
            expiresAt,
        });
        const url = openidClient.buildAuthorizationUrl(config, {
            redirect_uri: this.callbackUrl('oidc'),
            scope: conn.oidcScopes ?? 'openid email profile',
            state,
            nonce,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
        });
        return { url: url.toString(), state };
    }
    async handleOidcCallback(callbackUrl) {
        const state = callbackUrl.searchParams.get('state');
        if (!state)
            throw new common_1.BadRequestException('Missing state parameter');
        const [stored] = await this.db
            .select()
            .from(db_1.ssoLoginStates)
            .where((0, drizzle_orm_1.eq)(db_1.ssoLoginStates.state, state))
            .limit(1);
        if (!stored)
            throw new common_1.BadRequestException('Invalid or expired SSO state');
        if (stored.expiresAt < new Date()) {
            await this.db.delete(db_1.ssoLoginStates).where((0, drizzle_orm_1.eq)(db_1.ssoLoginStates.id, stored.id));
            throw new common_1.BadRequestException('SSO state has expired');
        }
        const [conn] = await this.db
            .select()
            .from(db_1.ssoConnections)
            .where((0, drizzle_orm_1.eq)(db_1.ssoConnections.id, stored.connectionId))
            .limit(1);
        if (!conn || !conn.oidcIssuer || !conn.oidcClientId || !conn.oidcClientSecret) {
            throw new common_1.NotFoundException('OIDC connection no longer available');
        }
        const config = await openidClient.discovery(new URL(conn.oidcIssuer), conn.oidcClientId, conn.oidcClientSecret);
        const tokens = await openidClient.authorizationCodeGrant(config, callbackUrl, {
            pkceCodeVerifier: stored.codeVerifier ?? undefined,
            expectedNonce: stored.nonce ?? undefined,
            expectedState: state,
        });
        const claims = tokens.claims();
        if (!claims)
            throw new common_1.BadRequestException('ID token missing claims');
        const emailClaim = conn.attributeMapping?.email ?? 'email';
        const nameClaim = conn.attributeMapping?.displayName ?? 'name';
        const rawEmail = String(claims[emailClaim] ?? '').toLowerCase();
        if (!rawEmail)
            throw new common_1.BadRequestException('OIDC response did not include an email claim');
        const displayName = String(claims[nameClaim] ?? rawEmail.split('@')[0]);
        await this.db.delete(db_1.ssoLoginStates).where((0, drizzle_orm_1.eq)(db_1.ssoLoginStates.id, stored.id));
        return this.completeSsoLogin(conn, rawEmail, displayName);
    }
    // ─── SAML flow ────────────────────────────────────────────────────────────
    async beginSamlLogin(workspaceId, redirectTo) {
        const conn = await this.getConnectionByProvider(workspaceId, 'saml');
        if (!conn || !conn.isEnabled)
            throw new common_1.NotFoundException('SAML not configured for workspace');
        if (!conn.samlIdpSsoUrl || !conn.samlIdpEntityId || !conn.samlIdpCertificate) {
            throw new common_1.BadRequestException('SAML connection is missing IdP metadata');
        }
        const saml = this.buildSamlClient(conn);
        const url = await saml.getAuthorizeUrlAsync('', this.callbackUrl('saml'), {});
        const state = (0, node_crypto_1.randomUUID)();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await this.db.insert(db_1.ssoLoginStates).values({
            connectionId: conn.id,
            workspaceId,
            state,
            redirectTo: redirectTo ?? null,
            expiresAt,
        });
        return { url };
    }
    async handleSamlCallback(body) {
        if (!body?.SAMLResponse)
            throw new common_1.BadRequestException('Missing SAMLResponse');
        const conns = await this.db
            .select()
            .from(db_1.ssoConnections)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.ssoConnections.provider, 'saml'), (0, drizzle_orm_1.eq)(db_1.ssoConnections.isEnabled, true)));
        // Try each enabled SAML connection until one validates. In practice this
        // is small (one connection per workspace) and the cert match makes the
        // correct conn unambiguous.
        let lastError;
        for (const conn of conns) {
            if (!conn.samlIdpSsoUrl || !conn.samlIdpCertificate)
                continue;
            try {
                const saml = this.buildSamlClient(conn);
                const { profile } = await saml.validatePostResponseAsync({
                    SAMLResponse: body.SAMLResponse,
                });
                if (!profile)
                    throw new common_1.BadRequestException('SAML response missing profile');
                const emailClaim = conn.attributeMapping?.email ?? 'email';
                const nameClaim = conn.attributeMapping?.displayName ?? 'displayName';
                const email = String(profile[emailClaim] ?? profile.email ?? profile.nameID ?? '').toLowerCase();
                if (!email)
                    throw new common_1.BadRequestException('SAML response did not include an email attribute');
                const displayName = String(profile[nameClaim] ?? profile.displayName ?? profile.cn ?? email.split('@')[0]);
                return await this.completeSsoLogin(conn, email, displayName);
            }
            catch (err) {
                lastError = err;
                continue;
            }
        }
        throw new common_1.BadRequestException(`SAML response could not be validated: ${lastError?.message ?? 'unknown error'}`);
    }
    buildSamlClient(conn) {
        return new node_saml_1.SAML({
            issuer: conn.samlSpEntityId ?? `rundesk:${conn.workspaceId}`,
            callbackUrl: this.callbackUrl('saml'),
            entryPoint: conn.samlIdpSsoUrl,
            idpIssuer: conn.samlIdpEntityId,
            idpCert: conn.samlIdpCertificate,
            wantAssertionsSigned: true,
            wantAuthnResponseSigned: false,
            signatureAlgorithm: 'sha256',
            digestAlgorithm: 'sha256',
            authnRequestBinding: 'HTTP-Redirect',
            identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
            racComparison: 'exact',
        });
    }
    // ─── JIT provisioning + audit ─────────────────────────────────────────────
    async completeSsoLogin(conn, email, displayName) {
        // Enforce domain match when configured
        if (conn.enforceForDomain) {
            const domain = email.split('@')[1]?.toLowerCase();
            if (!domain || domain !== conn.enforceForDomain.toLowerCase()) {
                throw new common_1.BadRequestException(`Email ${email} does not match the workspace-enforced SSO domain @${conn.enforceForDomain}`);
            }
        }
        const [workspace] = await this.db
            .select()
            .from(db_1.workspaces)
            .where((0, drizzle_orm_1.eq)(db_1.workspaces.id, conn.workspaceId))
            .limit(1);
        if (!workspace)
            throw new common_1.NotFoundException('Workspace not found');
        let user = (await this.db.select().from(db_1.users).where((0, drizzle_orm_1.eq)(db_1.users.email, email)).limit(1))[0];
        let isNewUser = false;
        if (!user) {
            if (!conn.jitProvisioning) {
                throw new common_1.ConflictException('JIT provisioning is disabled for this workspace. Ask an admin to invite you first.');
            }
            const [created] = await this.db
                .insert(db_1.users)
                .values({
                email,
                displayName,
                passwordHash: null,
                emailVerified: true,
            })
                .returning();
            user = created;
            isNewUser = true;
        }
        else if (user.displayName !== displayName && displayName) {
            await this.db.update(db_1.users).set({ displayName, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(db_1.users.id, user.id));
            user.displayName = displayName;
        }
        const [membership] = await this.db
            .select()
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspace.id), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, user.id)))
            .limit(1);
        let isNewMembership = false;
        if (!membership) {
            if (!conn.jitProvisioning) {
                throw new common_1.ConflictException('JIT provisioning is disabled for this workspace. Ask an admin to invite you first.');
            }
            await this.db.insert(db_1.workspaceMembers).values({
                workspaceId: workspace.id,
                userId: user.id,
                role: (conn.defaultRole ?? 'member'),
            });
            isNewMembership = true;
        }
        await this.db
            .update(db_1.ssoConnections)
            .set({ lastUsedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.ssoConnections.id, conn.id));
        await this.security.logAuditEvent({
            workspaceId: conn.workspaceId,
            actorId: user.id,
            actorEmail: user.email,
            action: 'sso.login',
            resourceType: 'sso_connection',
            resourceId: conn.id,
            description: `Signed in via ${conn.provider.toUpperCase()} (${conn.displayName})`,
            metadata: { provider: conn.provider, jitNewUser: isNewUser, jitNewMember: isNewMembership },
        });
        return {
            userId: user.id,
            email: user.email,
            displayName: user.displayName ?? email,
            workspaceId: conn.workspaceId,
            isNewUser,
            isNewMembership,
            connectionId: conn.id,
        };
    }
    // ─── Utilities ────────────────────────────────────────────────────────────
    callbackUrl(provider) {
        const base = (this.config.get('API_URL') ?? this.appUrl.replace(':5173', ':3000')).replace(/\/$/, '');
        // Routes are served under the global prefix `/api/v1` (main.ts) with no
        // exclusions, so the redirect_uri handed to the IdP must include it or the
        // callback 404s. Idempotent: only append when API_URL doesn't already
        // carry the prefix.
        const withPrefix = /\/api\/v1$/.test(base) ? base : `${base}/api/v1`;
        return `${withPrefix}/auth/sso/${provider}/callback`;
    }
    /**
     * Strip secrets so connections can be returned to the UI safely. The full
     * client secret / certificate values are never exposed back to the client
     * — only redacted placeholders that indicate whether the field is set.
     */
    sanitizeConnection(row) {
        const redact = (value) => (value ? '••••••••' : null);
        return {
            ...row,
            oidcClientSecret: redact(row.oidcClientSecret),
            samlIdpCertificate: row.samlIdpCertificate
                ? `${row.samlIdpCertificate.slice(0, 40)}…(${row.samlIdpCertificate.length} chars)`
                : null,
        };
    }
    /** Best-effort cleanup of stale state rows; called by a scheduled task. */
    async pruneExpiredStates() {
        await this.db.delete(db_1.ssoLoginStates).where((0, drizzle_orm_1.lt)(db_1.ssoLoginStates.expiresAt, new Date()));
    }
    /** Issue a hash for SCIM token storage. Used by SCIM module. */
    hashScimToken(raw) {
        return (0, node_crypto_1.createHash)('sha256').update(raw).digest('hex');
    }
    generateScimToken() {
        const raw = `scim_${(0, node_crypto_1.randomBytes)(24).toString('base64url')}`;
        const hash = this.hashScimToken(raw);
        return { raw, hash, prefix: raw.slice(0, 12) };
    }
    /** Touch a connection on every SSO action so admins see real activity. */
    async touchConnection(connectionId) {
        await this.db
            .update(db_1.ssoConnections)
            .set({ lastUsedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.ssoConnections.id, connectionId), (0, drizzle_orm_1.isNotNull)(db_1.ssoConnections.id)));
    }
};
exports.SsoService = SsoService;
exports.SsoService = SsoService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, config_1.ConfigService,
        security_service_1.SecurityService])
], SsoService);
//# sourceMappingURL=sso.service.js.map