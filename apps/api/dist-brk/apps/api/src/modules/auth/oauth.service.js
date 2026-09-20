"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var OAuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const security_service_1 = require("../security/security.service");
const oauth_util_1 = require("./oauth.util");
const PROVIDER_LABEL = { google: 'Google', microsoft: 'Microsoft' };
/**
 * Google + Microsoft social login (OAuth 2.0 authorization-code flow).
 *
 * Credentials are read from the environment via ConfigService and the whole
 * feature is env-gated: when a provider's client id/secret are absent the
 * provider is simply reported as "not configured" (like web-push), so the flow
 * stays dormant until an operator sets the secrets. Session minting is delegated
 * to AuthService (see the controller) — this service only resolves the external
 * identity and links it to a Rundesk user.
 */
let OAuthService = OAuthService_1 = class OAuthService {
    constructor(db, config, security) {
        this.db = db;
        this.config = config;
        this.security = security;
        this.logger = new common_1.Logger(OAuthService_1.name);
    }
    // ─── Env-gated provider credentials ─────────────────────────────────────────
    creds(provider) {
        const prefix = provider === 'google' ? 'GOOGLE' : 'MICROSOFT';
        const clientId = this.config.get(`${prefix}_OAUTH_CLIENT_ID`);
        const clientSecret = this.config.get(`${prefix}_OAUTH_CLIENT_SECRET`);
        if (!clientId || !clientSecret)
            return null;
        return { clientId, clientSecret };
    }
    isConfigured(provider) {
        return this.creds(provider) !== null;
    }
    /** Which providers have env creds present — powers GET /auth/oauth/providers. */
    configuredProviders() {
        return { google: this.isConfigured('google'), microsoft: this.isConfigured('microsoft') };
    }
    // ─── State signing + redirect URI ───────────────────────────────────────────
    /** HMAC key for the signed `state`. Falls back to the always-present JWT secret. */
    get stateSecret() {
        return this.config.get('OAUTH_STATE_SECRET') ?? this.config.getOrThrow('JWT_ACCESS_SECRET');
    }
    /**
     * The provider redirect_uri. Must be identical at authorize + token-exchange
     * time, so both paths call this. Falls back to `${API_URL}/api/v1` (the global
     * route prefix) when OAUTH_REDIRECT_BASE is not set.
     */
    redirectUri(provider) {
        const configured = this.config.get('OAUTH_REDIRECT_BASE');
        const base = configured
            ? configured.replace(/\/$/, '')
            : `${(this.config.get('API_URL') ?? 'http://localhost:3001').replace(/\/$/, '')}/api/v1`;
        return `${base}/auth/oauth/${provider}/callback`;
    }
    // ─── Authorize step ─────────────────────────────────────────────────────────
    /** Build the provider authorize URL + the signed state to plant in a cookie. */
    beginLogin(provider) {
        const creds = this.creds(provider);
        if (!creds)
            throw new common_1.BadRequestException(`${PROVIDER_LABEL[provider]} OAuth is not configured`);
        const state = (0, oauth_util_1.createOAuthState)(provider, this.stateSecret);
        const url = (0, oauth_util_1.buildAuthorizeUrl)(provider, {
            clientId: creds.clientId,
            redirectUri: this.redirectUri(provider),
            state,
        });
        return { url, state };
    }
    /**
     * Validate the round-tripped `state`: it must equal the value we planted in
     * the httpOnly cookie AND carry a valid, unexpired signature for this provider.
     */
    validateState(provider, queryState, cookieState) {
        if (!queryState || !cookieState || queryState !== cookieState) {
            throw new common_1.BadRequestException('Invalid or missing OAuth state');
        }
        if (!(0, oauth_util_1.verifyOAuthState)(queryState, this.stateSecret, { provider })) {
            throw new common_1.BadRequestException('OAuth state failed verification');
        }
    }
    // ─── Callback step: code → tokens → profile ─────────────────────────────────
    async exchangeCodeForProfile(provider, code) {
        const creds = this.creds(provider);
        if (!creds)
            throw new common_1.BadRequestException(`${PROVIDER_LABEL[provider]} OAuth is not configured`);
        const meta = oauth_util_1.PROVIDER_META[provider];
        const form = new URLSearchParams({
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
            code,
            redirect_uri: this.redirectUri(provider),
            grant_type: 'authorization_code',
        });
        const tokenRes = await fetch(meta.tokenUrl, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form.toString(),
            signal: AbortSignal.timeout(20_000),
        });
        if (!tokenRes.ok) {
            this.logger.warn(`${provider} token exchange failed (${tokenRes.status})`);
            throw new common_1.BadRequestException(`OAuth token exchange failed (${tokenRes.status})`);
        }
        const token = (await tokenRes.json());
        if (!token.access_token)
            throw new common_1.BadRequestException('OAuth token payload missing access token');
        const infoRes = await fetch(meta.userInfoUrl, {
            headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' },
            signal: AbortSignal.timeout(20_000),
        });
        if (!infoRes.ok) {
            throw new common_1.BadRequestException(`Failed to fetch ${PROVIDER_LABEL[provider]} profile (${infoRes.status})`);
        }
        const info = (await infoRes.json());
        const email = String(info.email ?? info.preferred_username ?? info.upn ?? '')
            .toLowerCase()
            .trim();
        if (!email)
            throw new common_1.BadRequestException(`${PROVIDER_LABEL[provider]} account did not return an email`);
        const providerId = String(info.sub ?? info.id ?? email);
        const displayName = String(info.name ?? info.given_name ?? email.split('@')[0]);
        const avatarUrl = info.picture ? String(info.picture) : null;
        return {
            profile: { providerId, email, displayName, avatarUrl },
            tokens: {
                accessToken: token.access_token,
                refreshToken: token.refresh_token ?? null,
                expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
            },
        };
    }
    // ─── User upsert + account linking ──────────────────────────────────────────
    /**
     * Upsert the Rundesk user by email and link the `oauth_accounts` row for
     * (provider, providerId). New users are created password-less with a verified
     * email (the provider vouches for it), mirroring SSO JIT provisioning. Returns
     * the user id for session minting + an audit trail entry.
     */
    async upsertUserAndLink(provider, profile, _tokens, meta = {}) {
        let user = (await this.db.select().from(db_1.users).where((0, drizzle_orm_1.eq)(db_1.users.email, profile.email)).limit(1))[0];
        let isNewUser = false;
        if (!user) {
            const [created] = await this.db
                .insert(db_1.users)
                .values({
                email: profile.email,
                displayName: profile.displayName,
                avatarUrl: profile.avatarUrl,
                passwordHash: null,
                emailVerified: true,
            })
                .returning();
            user = created;
            isNewUser = true;
        }
        else {
            // Refresh name/avatar from the provider without clobbering set values with blanks.
            const patch = {};
            if (profile.displayName && profile.displayName !== user.displayName)
                patch.displayName = profile.displayName;
            if (profile.avatarUrl && profile.avatarUrl !== user.avatarUrl)
                patch.avatarUrl = profile.avatarUrl;
            if (!user.emailVerified)
                patch.emailVerified = true;
            if (Object.keys(patch).length > 0) {
                await this.db.update(db_1.users).set({ ...patch, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(db_1.users.id, user.id));
            }
        }
        // Link the oauth_accounts row. We deliberately do NOT persist the provider
        // access/refresh tokens: they are used transiently during the callback to
        // fetch the profile and are never read back anywhere in the app, so storing
        // them at rest would be an unnecessary plaintext-secret liability. The
        // columns are left null. (If a future feature needs offline provider access,
        // reintroduce them encrypted at rest — e.g. AES-256-GCM with
        // TOKEN_ENCRYPTION_KEY — rather than in plaintext.)
        const existingLink = (await this.db
            .select()
            .from(db_1.oauthAccounts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.oauthAccounts.provider, provider), (0, drizzle_orm_1.eq)(db_1.oauthAccounts.providerId, profile.providerId)))
            .limit(1))[0];
        if (existingLink) {
            await this.db
                .update(db_1.oauthAccounts)
                .set({
                userId: user.id,
                accessToken: null,
                refreshToken: null,
                expiresAt: null,
            })
                .where((0, drizzle_orm_1.eq)(db_1.oauthAccounts.id, existingLink.id));
        }
        else {
            await this.db.insert(db_1.oauthAccounts).values({
                userId: user.id,
                provider,
                providerId: profile.providerId,
                accessToken: null,
                refreshToken: null,
                expiresAt: null,
            });
        }
        await this.security.logAuditEvent({
            actorId: user.id,
            actorEmail: user.email,
            action: 'auth.oauth_login',
            resourceType: 'user',
            resourceId: user.id,
            description: `Signed in via ${PROVIDER_LABEL[provider]} (OAuth)`,
            metadata: { provider, newUser: isNewUser },
            ipAddress: meta.ip,
            userAgent: meta.userAgent,
        });
        return { userId: user.id, isNewUser };
    }
};
exports.OAuthService = OAuthService;
exports.OAuthService = OAuthService = OAuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, config_1.ConfigService,
        security_service_1.SecurityService])
], OAuthService);
//# sourceMappingURL=oauth.service.js.map