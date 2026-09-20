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
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
exports.hashRefreshToken = hashRefreshToken;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const node_crypto_1 = require("node:crypto");
const drizzle_orm_1 = require("drizzle-orm");
const bcryptjs_1 = require("bcryptjs");
const db_1 = require("@rundesk/db");
const signup_features_1 = require("./signup-features");
const database_module_1 = require("../../common/database/database.module");
const users_service_1 = require("../users/users.service");
const workspaces_service_1 = require("../workspaces/workspaces.service");
const feature_flags_service_1 = require("../feature-flags/feature-flags.service");
const email_service_1 = require("../email/email.service");
const security_service_1 = require("../security/security.service");
const workspace_security_settings_service_1 = require("../security/workspace-security-settings.service");
const ip_allowlist_util_1 = require("../security/ip-allowlist.util");
function slugify(input) {
    return input
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '')
        .slice(0, 40) || 'workspace';
}
/**
 * One-way hash of a refresh token for storage/lookup.
 *
 * Only this SHA-256 digest is ever persisted in `sessions.refreshToken` — never
 * the raw signed JWT — so read access to the DB no longer yields directly-usable
 * refresh tokens. The raw JWT is still handed back to the client (response body
 * + httpOnly cookie); only the stored copy is hashed. Lookups hash the incoming
 * token the same way and match on the digest. The column stays `text` (a hex
 * digest fits), so this needs no schema migration.
 */
function hashRefreshToken(token) {
    return (0, node_crypto_1.createHash)('sha256').update(token).digest('hex');
}
let AuthService = AuthService_1 = class AuthService {
    constructor(db, usersService, workspacesService, jwtService, config, featureFlagsService, emailService, security, securitySettings) {
        this.db = db;
        this.usersService = usersService;
        this.workspacesService = workspacesService;
        this.jwtService = jwtService;
        this.config = config;
        this.featureFlagsService = featureFlagsService;
        this.emailService = emailService;
        this.security = security;
        this.securitySettings = securitySettings;
        this.logger = new common_1.Logger(AuthService_1.name);
    }
    async validateUser(email, password) {
        const user = await this.usersService.findByEmail(email);
        if (!user?.passwordHash)
            throw new common_1.UnauthorizedException('Invalid credentials');
        const { settings } = await this.securitySettings.getEffectiveForUser(user.id);
        const now = new Date();
        // Account currently locked from prior failed attempts (auto-releasing).
        // Enforcement stays server-side (a locked account cannot log in), but the
        // client always sees the SAME generic "Invalid credentials" message — a
        // distinct "account locked" response would let an attacker enumerate which
        // emails belong to real accounts.
        if (settings.lockoutEnabled && user.lockedUntil && new Date(user.lockedUntil) > now) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (!(0, bcryptjs_1.compareSync)(password, user.passwordHash)) {
            if (settings.lockoutEnabled) {
                const attempts = (user.failedLoginAttempts ?? 0) + 1;
                if (attempts >= settings.lockoutThreshold) {
                    // Still lock the account server-side, but do not disclose it.
                    const lockedUntil = new Date(now.getTime() + settings.lockoutDurationMinutes * 60000);
                    await this.db.update(db_1.users).set({ failedLoginAttempts: 0, lockedUntil }).where((0, drizzle_orm_1.eq)(db_1.users.id, user.id));
                }
                else {
                    await this.db.update(db_1.users).set({ failedLoginAttempts: attempts }).where((0, drizzle_orm_1.eq)(db_1.users.id, user.id));
                }
            }
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (!user.isActive)
            throw new common_1.UnauthorizedException('Account is disabled');
        // Successful login clears any failed-attempt state.
        if ((user.failedLoginAttempts ?? 0) > 0 || user.lockedUntil) {
            await this.db.update(db_1.users).set({ failedLoginAttempts: 0, lockedUntil: null }).where((0, drizzle_orm_1.eq)(db_1.users.id, user.id));
        }
        return user;
    }
    /**
     * Second factor enforcement, run AFTER the password has been validated and
     * BEFORE any session token is issued.
     *
     * - If the account has no VERIFIED TOTP secret, this is a no-op (returns) so
     *   password-only accounts — including the entire existing test suite — behave
     *   exactly as before.
     * - If TOTP is enabled but no `totpCode` was supplied, throws HTTP 401 with a
     *   machine-readable `{ error: 'totp_required' }` body so the frontend can
     *   prompt for the code. No tokens are issued.
     * - If a code is supplied it is verified via the security module's
     *   {@link SecurityService.validateTotp}, which also accepts a one-time backup
     *   code. An invalid code throws 401.
     */
    async assertTotpSatisfied(userId, totpCode) {
        const { enabled } = await this.security.getTotpStatus(userId);
        if (!enabled)
            return;
        if (!totpCode) {
            throw new common_1.UnauthorizedException({
                error: 'totp_required',
                message: 'A two-factor authentication code is required.',
            });
        }
        const ok = await this.security.validateTotp(userId, totpCode);
        if (!ok) {
            throw new common_1.UnauthorizedException({
                error: 'totp_invalid',
                message: 'Invalid two-factor authentication code.',
            });
        }
    }
    async login(user, meta = {}) {
        const memberships = await this.workspacesService.findByMember(user.id);
        /*
         * WHICH WORKSPACE'S POLICY GOVERNS THIS SESSION.
         *
         * This used to be `memberships[0]` — the first row of a query that had no
         * `ORDER BY`. That one arbitrary row decided four things: the
         * `workspaceId` claim baked into the access token, the feature flags baked
         * in beside it, the refresh-token TTL and concurrent-session cap, and
         * whether the IP allowlist applied at all. For anyone in two workspaces,
         * Postgres was choosing the security policy.
         *
         * `validateUser`, seventy lines above, already asked the right question —
         * `getEffectiveForUser`, which orders by `joinedAt` and returns the role of
         * THAT membership. So the password-lockout policy came from one workspace
         * while the IP allowlist came from whichever one the planner put first, and
         * they were not necessarily the same workspace in the same sign-in.
         *
         * Now both paths resolve identically. `findByMember` is ordered to match,
         * so the switcher's first entry is the workspace being described here.
         */
        const { settings, isWorkspaceAdmin } = await this.securitySettings.getEffectiveForUser(user.id);
        const primaryWorkspaceId = settings.workspaceId;
        // IP allowlist: block credential/refresh logins from disallowed IPs. Fails
        // OPEN when the list is empty or the client IP can't be determined, and
        // exempts workspace admins unless the policy opts them in (emergency access).
        if (settings.ipAllowlistEnabled && settings.ipAllowlist.length > 0 && meta.ip) {
            /*
             * The exemption reads the role of the SAME membership the policy came
             * from. It used to read `memberships[0]?.role`, so being an admin in any
             * workspace could exempt you from a different workspace's allowlist.
             */
            const exempt = isWorkspaceAdmin && !settings.ipAllowlistIncludeAdmins;
            if (!exempt && !(0, ip_allowlist_util_1.isIpAllowed)(meta.ip, settings.ipAllowlist)) {
                await this.security.logAuditEvent({
                    workspaceId: primaryWorkspaceId ?? undefined,
                    actorId: user.id,
                    actorEmail: user.email,
                    action: 'auth.ip_blocked',
                    resourceType: 'user',
                    resourceId: user.id,
                    description: `Login blocked by IP allowlist from ${meta.ip}`,
                    ipAddress: meta.ip,
                    userAgent: meta.userAgent,
                });
                throw new common_1.ForbiddenException('Access from your IP address is not allowed by this workspace’s security policy.');
            }
        }
        // Fetch org memberships for workspace switcher (ClickUp-style)
        const orgMemberships = await this.db
            .select({ org: db_1.organizations, role: db_1.organizationMembers.role })
            .from(db_1.organizationMembers)
            .innerJoin(db_1.organizations, (0, drizzle_orm_1.eq)(db_1.organizationMembers.organizationId, db_1.organizations.id))
            .where((0, drizzle_orm_1.eq)(db_1.organizationMembers.userId, user.id));
        const resolvedFlags = await this.featureFlagsService.resolveForUser({
            userId: user.id,
            workspaceId: primaryWorkspaceId ?? '',
            role: user.role,
        });
        const accessToken = this.jwtService.sign({
            sub: user.id,
            email: user.email,
            role: user.role,
            workspaceId: primaryWorkspaceId,
            flags: resolvedFlags.flags,
        });
        // Session lifetime is driven by the workspace policy (idle/inactivity
        // timeout): each refresh rotates the token and re-extends the window, so a
        // session that goes unused longer than this expires and forces re-login.
        const ttlMinutes = settings.sessionTimeoutMinutes;
        const refreshToken = this.jwtService.sign({ sub: user.id, type: 'refresh', jti: (0, node_crypto_1.randomUUID)() }, {
            secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
            expiresIn: `${ttlMinutes}m`,
        });
        const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
        // Store only the hash of the refresh token at rest (the raw JWT is still
        // returned to the client below). See hashRefreshToken().
        await this.db.insert(db_1.sessions).values({
            userId: user.id,
            refreshToken: hashRefreshToken(refreshToken),
            userAgent: meta.userAgent,
            ipAddress: meta.ip,
            expiresAt,
        });
        // Concurrent-session cap: revoke the oldest sessions beyond the limit.
        if (settings.maxConcurrentSessions > 0) {
            await this.enforceSessionCap(user.id, settings.maxConcurrentSessions);
        }
        await this.security.logAuditEvent({
            workspaceId: primaryWorkspaceId ?? undefined,
            actorId: user.id,
            actorEmail: user.email,
            action: 'auth.login',
            resourceType: 'user',
            resourceId: user.id,
            description: `Signed in as ${user.email}`,
            ipAddress: meta.ip,
            userAgent: meta.userAgent,
        });
        const { passwordHash: _discard, ...safeUser } = user;
        void _discard;
        return {
            accessToken,
            refreshToken,
            user: safeUser,
            workspaces: memberships.map((m) => ({ ...m.workspace, role: m.role })),
            organizations: orgMemberships.map((m) => ({ ...m.org, role: m.role })),
        };
    }
    async issueSessionForUserId(userId, meta = {}) {
        const user = await this.usersService.findById(userId);
        if (!user)
            throw new common_1.UnauthorizedException('User not found');
        return this.login(user, meta);
    }
    /** Revoke the oldest active sessions beyond `max` (newest are kept). */
    async enforceSessionCap(userId, max) {
        const active = await this.db
            .select({ id: db_1.sessions.id })
            .from(db_1.sessions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.sessions.userId, userId), (0, drizzle_orm_1.eq)(db_1.sessions.isRevoked, false)))
            .orderBy((0, drizzle_orm_1.desc)(db_1.sessions.createdAt));
        for (const stale of active.slice(max)) {
            await this.db.update(db_1.sessions).set({ isRevoked: true }).where((0, drizzle_orm_1.eq)(db_1.sessions.id, stale.id));
        }
    }
    /** Apply the password policy (strength + breach check) to a new password. */
    async enforcePasswordPolicy(password, policy) {
        if (policy.requireStrong) {
            const problem = this.securitySettings.passwordStrengthProblem(password);
            if (problem)
                throw new common_1.BadRequestException(problem);
        }
        if (policy.blockBreached && (await this.securitySettings.isPasswordBreached(password))) {
            throw new common_1.BadRequestException('This password has appeared in a known data breach. Please choose a different one.');
        }
    }
    /**
     * POST /auth/signup — Atomic org + workspace creation.
     * All rows (user, org, org_member, workspace, workspace_member, invitations)
     * are inserted in a single DB transaction; any failure rolls back everything.
     */
    async signUp(dto, meta = {}) {
        const existing = await this.usersService.findByEmail(dto.email.toLowerCase());
        if (existing)
            throw new common_1.ConflictException('An account with this email already exists');
        // New accounts must meet the strong-password baseline. (Breach checking is
        // a per-workspace opt-in; there is no workspace yet at sign-up time.)
        await this.enforcePasswordPolicy(dto.password, { requireStrong: true, blockBreached: false });
        const appUrl = this.config.get('APP_URL', 'http://localhost:5173');
        const result = await this.db.transaction(async (tx) => {
            // 1. Create user
            const [user] = await tx
                .insert(db_1.users)
                .values({
                email: dto.email.toLowerCase(),
                displayName: dto.fullName,
                passwordHash: (0, bcryptjs_1.hashSync)(dto.password, 12),
                emailVerified: false,
            })
                .returning();
            // 2. Create organization
            const baseSlug = slugify(dto.organizationSlug ?? dto.organizationName);
            let orgSlug = baseSlug;
            let attempt = 0;
            while (true) {
                const [hit] = await tx
                    .select({ id: db_1.organizations.id })
                    .from(db_1.organizations)
                    .where((0, drizzle_orm_1.eq)(db_1.organizations.slug, orgSlug))
                    .limit(1);
                if (!hit)
                    break;
                attempt++;
                orgSlug = `${baseSlug}-${attempt}`;
                if (attempt > 50)
                    orgSlug = `${baseSlug}-${Date.now()}`;
            }
            const [org] = await tx
                .insert(db_1.organizations)
                .values({ name: dto.organizationName, slug: orgSlug })
                .returning();
            // 3. Make user the org owner
            await tx.insert(db_1.organizationMembers).values({
                organizationId: org.id,
                userId: user.id,
                role: 'owner',
            });
            // 4. Create default workspace (same name as org)
            const wsSlug = orgSlug;
            const [workspace] = await tx
                .insert(db_1.workspaces)
                .values({ organizationId: org.id, name: dto.organizationName, slug: wsSlug })
                .returning();
            // 5. Make user workspace_admin
            await tx.insert(db_1.workspaceMembers).values({
                workspaceId: workspace.id,
                userId: user.id,
                role: 'workspace_admin',
            });
            // §1.1 — this path inserts the workspace itself rather than going through
            // workspacesService.create(), so seeding types only there left every
            // account created through signup with none. A workspace with no types
            // hides the type picker, the search filter and the settings tab, so the
            // feature was invisible on the path most workspaces are actually born on.
            await tx.insert(db_1.taskTypes).values(db_1.DEFAULT_TASK_TYPES.map((type) => ({ ...type, workspaceId: workspace.id })));
            /*
             * G08-4 [08:43], [09:02] — honour the feature picker.
             *
             * The wizard's second step says, in as many words: "Pick what you'll use
             * — we'll turn the rest off so the workspace stays uncluttered." The
             * picks arrived, the DTO declared them, and `signUp` read them nowhere.
             * The sentence was false, and the workspace came up with the platform
             * defaults whatever anybody ticked.
             *
             * Written inside the same transaction as the workspace: a workspace that
             * exists with the wrong features switched on, because a second write
             * failed, is the state this is meant to prevent.
             *
             * Only flags named by a pill are touched. Auth and SSO keep their
             * defaults because nobody was asked about them, and writing rows for
             * settings a user never saw would be its own kind of dishonest.
             */
            const flagRows = (0, signup_features_1.signupFeatureRows)(dto.features, workspace, user.id);
            if (flagRows.length) {
                await tx
                    .insert(db_1.featureFlags)
                    .values(flagRows)
                    // A flag can be governed by more than one pill in future; last write
                    // wins rather than blowing up the whole signup on a unique clash.
                    .onConflictDoUpdate({
                    target: [db_1.featureFlags.flagKey, db_1.featureFlags.scope, db_1.featureFlags.scopeId, db_1.featureFlags.workspaceId],
                    set: { enabled: (0, drizzle_orm_1.sql) `excluded.enabled`, updatedAt: new Date() },
                });
            }
            // 6. Create initial invitations
            const inviteTokens = [];
            if (dto.invites && dto.invites.length > 0) {
                for (const inv of dto.invites) {
                    const token = (0, node_crypto_1.randomBytes)(32).toString('base64url');
                    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                    await tx.insert(db_1.invitations).values({
                        organizationId: org.id,
                        email: inv.email.toLowerCase(),
                        orgRole: inv.orgRole === 'admin' ? 'admin' : 'member',
                        workspaceMemberships: [
                            {
                                workspaceId: workspace.id,
                                role: inv.workspaceRole ?? 'member',
                            },
                        ],
                        invitedByUserId: user.id,
                        token,
                        expiresAt,
                    }).onConflictDoNothing();
                    const claimUrl = `${appUrl}/accept-invite?token=${token}`;
                    inviteTokens.push({ email: inv.email.toLowerCase(), token, claimUrl });
                }
            }
            return { user, org, workspace, inviteTokens };
        });
        // Log claim URLs in dev (when email service not configured)
        for (const inv of result.inviteTokens) {
            this.logger.log(`[DEV] Invitation for ${inv.email}: ${inv.claimUrl}`);
        }
        // Send an email-verification link (best-effort; never blocks signup).
        await this.issueEmailVerification(result.user.id, result.user.email, result.user.displayName);
        return this.login(result.user, meta);
    }
    /** Create a verification token and email the confirmation link. */
    async issueEmailVerification(userId, email, displayName) {
        try {
            const token = (0, node_crypto_1.randomBytes)(32).toString('base64url');
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            await this.db.insert(db_1.emailVerifications).values({ userId, token, expiresAt });
            const appUrl = this.config.get('APP_URL', 'http://localhost:5173');
            await this.emailService.sendVerificationEmail({
                to: email,
                recipientName: displayName,
                verifyUrl: `${appUrl}/verify-email?token=${token}`,
                expiresAt,
            });
        }
        catch (err) {
            this.logger.error(`Failed to issue email verification for ${email}: ${err.message}`);
        }
    }
    /** Confirm an email with a token, flipping users.emailVerified to true. */
    async verifyEmail(token) {
        if (!token)
            throw new common_1.BadRequestException('Missing verification token');
        const [row] = await this.db
            .select()
            .from(db_1.emailVerifications)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.emailVerifications.token, token), (0, drizzle_orm_1.isNull)(db_1.emailVerifications.usedAt)))
            .limit(1);
        if (!row || row.expiresAt < new Date()) {
            throw new common_1.BadRequestException('Verification link is invalid or expired');
        }
        await this.db.update(db_1.users).set({ emailVerified: true }).where((0, drizzle_orm_1.eq)(db_1.users.id, row.userId));
        await this.db
            .update(db_1.emailVerifications)
            .set({ usedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(db_1.emailVerifications.id, row.id));
        return { ok: true };
    }
    /** Re-send a verification link. Silent about whether the account exists. */
    async resendVerification(email) {
        const normalized = email.toLowerCase().trim();
        const user = await this.usersService.findByEmail(normalized);
        if (user && !user.emailVerified) {
            await this.issueEmailVerification(user.id, user.email, user.displayName);
        }
        return { ok: true };
    }
    /** @deprecated Use signUp for new accounts */
    async register(dto, meta = {}) {
        const existing = await this.usersService.findByEmail(dto.email);
        if (existing)
            throw new common_1.ConflictException('Email already in use');
        await this.enforcePasswordPolicy(dto.password, { requireStrong: true, blockBreached: false });
        const user = await this.usersService.create({
            email: dto.email,
            displayName: dto.displayName,
            passwordHash: (0, bcryptjs_1.hashSync)(dto.password, 12),
        });
        await this.workspacesService.createPersonalWorkspace(user.id, user.displayName);
        return this.login(user, meta);
    }
    /**
     * Locate the session row for a presented refresh token.
     *
     * Primary path: match on the token's SHA-256 hash — how all new/rotated
     * sessions are stored (see hashRefreshToken).
     *
     * Migration-in-place fallback: if the hash misses, retry with the raw token to
     * catch sessions written before hashing-at-rest was introduced. On a legacy
     * hit we transparently re-store that row's `refreshToken` as the hash, so it is
     * upgraded on first use. This is what avoids force-logging-out every existing
     * session on deploy. The legacy branch can be deleted once all sessions have
     * rotated past the old plaintext storage.
     */
    async findSessionByRefreshToken(token) {
        const hashed = hashRefreshToken(token);
        const [byHash] = await this.db.select().from(db_1.sessions).where((0, drizzle_orm_1.eq)(db_1.sessions.refreshToken, hashed));
        if (byHash)
            return byHash;
        const [legacy] = await this.db.select().from(db_1.sessions).where((0, drizzle_orm_1.eq)(db_1.sessions.refreshToken, token));
        if (legacy) {
            await this.db.update(db_1.sessions).set({ refreshToken: hashed }).where((0, drizzle_orm_1.eq)(db_1.sessions.id, legacy.id));
            return { ...legacy, refreshToken: hashed };
        }
        return undefined;
    }
    async refresh(token, meta = {}) {
        let payload;
        try {
            payload = this.jwtService.verify(token, {
                secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
            });
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        // The token is a real, signature-verified JWT (checked above); we only look
        // up the session ROW by the token's hash here.
        const session = await this.findSessionByRefreshToken(token);
        if (!session || session.isRevoked || session.expiresAt < new Date()) {
            throw new common_1.UnauthorizedException('Session expired');
        }
        const user = await this.usersService.findById(payload.sub);
        if (!user)
            throw new common_1.UnauthorizedException();
        await this.db.update(db_1.sessions).set({ isRevoked: true }).where((0, drizzle_orm_1.eq)(db_1.sessions.id, session.id));
        return this.login(user, meta);
    }
    async logout(refreshToken) {
        // Locate by hash (with the legacy raw-token fallback) then revoke by id, so
        // logout keeps working for both hashed and not-yet-upgraded sessions.
        const session = await this.findSessionByRefreshToken(refreshToken);
        if (session) {
            await this.db.update(db_1.sessions).set({ isRevoked: true }).where((0, drizzle_orm_1.eq)(db_1.sessions.id, session.id));
        }
    }
    async listSessions(userId, currentRefreshToken) {
        const rows = await this.db
            .select({
            id: db_1.sessions.id,
            userAgent: db_1.sessions.userAgent,
            ipAddress: db_1.sessions.ipAddress,
            isRevoked: db_1.sessions.isRevoked,
            expiresAt: db_1.sessions.expiresAt,
            createdAt: db_1.sessions.createdAt,
            refreshToken: db_1.sessions.refreshToken,
        })
            .from(db_1.sessions)
            .where((0, drizzle_orm_1.eq)(db_1.sessions.userId, userId));
        // Stored tokens are SHA-256 hashes, so hash the presented token before
        // comparing. The raw fallback matches legacy sessions not yet upgraded.
        const hashedCurrent = currentRefreshToken ? hashRefreshToken(currentRefreshToken) : null;
        return rows
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((row) => ({
            id: row.id,
            userAgent: row.userAgent,
            ipAddress: row.ipAddress,
            isRevoked: row.isRevoked,
            expiresAt: row.expiresAt,
            createdAt: row.createdAt,
            isCurrent: Boolean(currentRefreshToken) &&
                (row.refreshToken === hashedCurrent || row.refreshToken === currentRefreshToken),
        }));
    }
    async revokeSession(userId, sessionId) {
        const [session] = await this.db
            .select({ id: db_1.sessions.id })
            .from(db_1.sessions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.sessions.id, sessionId), (0, drizzle_orm_1.eq)(db_1.sessions.userId, userId)))
            .limit(1);
        if (!session)
            throw new common_1.UnauthorizedException('Session not found');
        await this.db.update(db_1.sessions).set({ isRevoked: true }).where((0, drizzle_orm_1.eq)(db_1.sessions.id, session.id));
        return { revoked: true };
    }
    async revokeOtherSessions(userId, currentRefreshToken) {
        const userSessions = await this.db
            .select({ id: db_1.sessions.id, refreshToken: db_1.sessions.refreshToken })
            .from(db_1.sessions)
            .where((0, drizzle_orm_1.eq)(db_1.sessions.userId, userId));
        // Keep the current session; stored tokens are hashes, so compare against the
        // hash (raw fallback covers legacy, not-yet-upgraded sessions).
        const hashedCurrent = currentRefreshToken ? hashRefreshToken(currentRefreshToken) : null;
        const idsToRevoke = userSessions
            .filter((s) => !currentRefreshToken ||
            (s.refreshToken !== hashedCurrent && s.refreshToken !== currentRefreshToken))
            .map((s) => s.id);
        for (const id of idsToRevoke) {
            await this.db.update(db_1.sessions).set({ isRevoked: true }).where((0, drizzle_orm_1.eq)(db_1.sessions.id, id));
        }
        return { revoked: idsToRevoke.length };
    }
    async requestPasswordReset(email) {
        const normalizedEmail = email.toLowerCase().trim();
        const user = await this.usersService.findByEmail(normalizedEmail);
        // Do not reveal whether an account exists.
        if (!user)
            return { ok: true };
        const token = (0, node_crypto_1.randomBytes)(32).toString('base64url');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await this.db.insert(db_1.passwordResets).values({
            userId: user.id,
            token,
            expiresAt,
        });
        const appUrl = this.config.get('APP_URL', 'http://localhost:5173');
        const resetUrl = `${appUrl}/login?token=${token}`;
        if ((this.config.get('NODE_ENV') ?? 'development') !== 'production') {
            this.logger.log(`[DEV] Password reset for ${user.email}: ${resetUrl}`);
        }
        await this.emailService.sendPasswordResetEmail({
            to: user.email,
            recipientName: user.displayName,
            resetUrl,
            expiresAt,
        });
        return { ok: true };
    }
    async resetPassword(token, newPassword) {
        if (!newPassword || newPassword.length < 8) {
            throw new common_1.UnauthorizedException('Password must be at least 8 characters');
        }
        const [row] = await this.db
            .select()
            .from(db_1.passwordResets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.passwordResets.token, token), (0, drizzle_orm_1.isNull)(db_1.passwordResets.usedAt)))
            .limit(1);
        if (!row || row.expiresAt < new Date()) {
            throw new common_1.UnauthorizedException('Reset link is invalid or expired');
        }
        // Enforce the resetting user's workspace password policy.
        const { settings } = await this.securitySettings.getEffectiveForUser(row.userId);
        await this.enforcePasswordPolicy(newPassword, {
            requireStrong: settings.requireStrongPasswords,
            blockBreached: settings.blockBreachedPasswords,
        });
        await this.db.transaction(async (tx) => {
            await tx
                .update(db_1.users)
                .set({ passwordHash: (0, bcryptjs_1.hashSync)(newPassword, 12), updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(db_1.users.id, row.userId));
            await tx
                .update(db_1.passwordResets)
                .set({ usedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(db_1.passwordResets.id, row.id));
            // Revoke all active sessions for security after password change.
            await tx.update(db_1.sessions).set({ isRevoked: true }).where((0, drizzle_orm_1.eq)(db_1.sessions.userId, row.userId));
        });
        return { ok: true };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, users_service_1.UsersService,
        workspaces_service_1.WorkspacesService,
        jwt_1.JwtService,
        config_1.ConfigService,
        feature_flags_service_1.FeatureFlagsService,
        email_service_1.EmailService,
        security_service_1.SecurityService,
        workspace_security_settings_service_1.WorkspaceSecuritySettingsService])
], AuthService);
//# sourceMappingURL=auth.service.js.map