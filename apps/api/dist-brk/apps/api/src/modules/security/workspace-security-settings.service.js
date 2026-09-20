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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceSecuritySettingsService = exports.SECURITY_DEFAULTS = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const security_service_1 = require("./security.service");
const ip_allowlist_util_1 = require("./ip-allowlist.util");
// Mirrors the column defaults in the schema so an un-configured workspace
// behaves identically to one with a freshly-inserted default row.
exports.SECURITY_DEFAULTS = {
    ipAllowlistEnabled: false,
    ipAllowlist: [],
    ipAllowlistIncludeAdmins: false,
    sessionTimeoutMinutes: 10080,
    maxConcurrentSessions: 0,
    lockoutEnabled: true,
    lockoutThreshold: 5,
    lockoutDurationMinutes: 30,
    requireStrongPasswords: true,
    blockBreachedPasswords: false,
};
const clampInt = (v, min, max, fallback) => {
    const n = typeof v === 'number' ? Math.round(v) : Number(v);
    if (!Number.isFinite(n))
        return fallback;
    return Math.min(max, Math.max(min, n));
};
let WorkspaceSecuritySettingsService = class WorkspaceSecuritySettingsService {
    constructor(db, security) {
        this.db = db;
        this.security = security;
    }
    /** Settings for a workspace, falling back to defaults when no row exists. */
    async get(workspaceId) {
        if (!workspaceId)
            return { workspaceId: null, ...exports.SECURITY_DEFAULTS };
        const [row] = await this.db
            .select()
            .from(db_1.workspaceSecuritySettings)
            .where((0, drizzle_orm_1.eq)(db_1.workspaceSecuritySettings.workspaceId, workspaceId))
            .limit(1);
        if (!row)
            return { workspaceId, ...exports.SECURITY_DEFAULTS };
        return {
            workspaceId,
            ipAllowlistEnabled: row.ipAllowlistEnabled,
            ipAllowlist: row.ipAllowlist ?? [],
            ipAllowlistIncludeAdmins: row.ipAllowlistIncludeAdmins,
            sessionTimeoutMinutes: row.sessionTimeoutMinutes,
            maxConcurrentSessions: row.maxConcurrentSessions,
            lockoutEnabled: row.lockoutEnabled,
            lockoutThreshold: row.lockoutThreshold,
            lockoutDurationMinutes: row.lockoutDurationMinutes,
            requireStrongPasswords: row.requireStrongPasswords,
            blockBreachedPasswords: row.blockBreachedPasswords,
        };
    }
    /**
     * Upsert the workspace policy. Sanitises every field and — critically —
     * guarantees the admin saving the change cannot lock themselves out: when
     * the allowlist is enabled with a non-empty list, the requester's own IP is
     * auto-added if it isn't already covered.
     */
    async update(workspaceId, patch, actorId, requesterIp) {
        const current = await this.get(workspaceId);
        // Sanitise the IP list: keep only valid rules, trim, dedupe, cap length.
        let ipAllowlist = current.ipAllowlist;
        if (patch.ipAllowlist !== undefined) {
            const arr = Array.isArray(patch.ipAllowlist) ? patch.ipAllowlist : [];
            ipAllowlist = [
                ...new Set(arr
                    .filter((x) => typeof x === 'string')
                    .map((x) => x.trim())
                    .filter((x) => x && (0, ip_allowlist_util_1.isValidIpRule)(x))),
            ].slice(0, 200);
        }
        const next = {
            workspaceId,
            ipAllowlistEnabled: patch.ipAllowlistEnabled ?? current.ipAllowlistEnabled,
            ipAllowlist,
            ipAllowlistIncludeAdmins: patch.ipAllowlistIncludeAdmins ?? current.ipAllowlistIncludeAdmins,
            sessionTimeoutMinutes: patch.sessionTimeoutMinutes !== undefined
                ? clampInt(patch.sessionTimeoutMinutes, 5, 525600, current.sessionTimeoutMinutes)
                : current.sessionTimeoutMinutes,
            maxConcurrentSessions: patch.maxConcurrentSessions !== undefined
                ? clampInt(patch.maxConcurrentSessions, 0, 100, current.maxConcurrentSessions)
                : current.maxConcurrentSessions,
            lockoutEnabled: patch.lockoutEnabled ?? current.lockoutEnabled,
            lockoutThreshold: patch.lockoutThreshold !== undefined
                ? clampInt(patch.lockoutThreshold, 1, 100, current.lockoutThreshold)
                : current.lockoutThreshold,
            lockoutDurationMinutes: patch.lockoutDurationMinutes !== undefined
                ? clampInt(patch.lockoutDurationMinutes, 1, 1440, current.lockoutDurationMinutes)
                : current.lockoutDurationMinutes,
            requireStrongPasswords: patch.requireStrongPasswords ?? current.requireStrongPasswords,
            blockBreachedPasswords: patch.blockBreachedPasswords ?? current.blockBreachedPasswords,
        };
        // Anti-lockout: never let an admin enable an allowlist that excludes them.
        if (next.ipAllowlistEnabled && next.ipAllowlist.length > 0 && requesterIp) {
            if (!(0, ip_allowlist_util_1.isIpAllowed)(requesterIp, next.ipAllowlist)) {
                const clean = (0, ip_allowlist_util_1.canonicalIp)(requesterIp);
                if (clean && (0, ip_allowlist_util_1.isValidIpRule)(clean))
                    next.ipAllowlist = [...next.ipAllowlist, clean];
            }
        }
        const { workspaceId: _ws, ...values } = next;
        void _ws;
        await this.db
            .insert(db_1.workspaceSecuritySettings)
            .values({ workspaceId, ...values, updatedAt: new Date(), updatedById: actorId })
            .onConflictDoUpdate({
            target: db_1.workspaceSecuritySettings.workspaceId,
            set: { ...values, updatedAt: new Date(), updatedById: actorId },
        });
        await this.security.logAuditEvent({
            workspaceId,
            actorId,
            action: 'security.settings_updated',
            resourceType: 'workspace',
            resourceId: workspaceId,
            description: 'Updated workspace security settings',
            metadata: {
                ipAllowlistEnabled: next.ipAllowlistEnabled,
                ipAllowlistCount: next.ipAllowlist.length,
                sessionTimeoutMinutes: next.sessionTimeoutMinutes,
                maxConcurrentSessions: next.maxConcurrentSessions,
                lockoutEnabled: next.lockoutEnabled,
                requireStrongPasswords: next.requireStrongPasswords,
                blockBreachedPasswords: next.blockBreachedPasswords,
            },
            ipAddress: requesterIp,
        });
        return next;
    }
    /**
     * Resolve the effective policy for a user at login time: their primary
     * (earliest-joined) workspace, plus whether they are an admin there (used by
     * the IP-allowlist admin exemption).
     */
    async getEffectiveForUser(userId) {
        /*
         * ARCHIVED WORKSPACES ARE NOT CANDIDATES. This selected straight from
         * `workspace_members` with no join, so a person whose oldest membership
         * was in a workspace they had since archived took their session policy —
         * and, now that `login` resolves through here, their token's `workspaceId`
         * claim — from a workspace that no longer appears in their own switcher.
         * `WorkspacesService.findByMember` has always excluded archived ones; this
         * now agrees with it, which is the point of resolving in one place.
         */
        const [membership] = await this.db
            .select({ workspaceId: db_1.workspaceMembers.workspaceId, role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .innerJoin(db_1.workspaces, (0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, db_1.workspaces.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, userId), (0, drizzle_orm_1.eq)(db_1.workspaces.isArchived, false)))
            .orderBy((0, drizzle_orm_1.asc)(db_1.workspaceMembers.joinedAt))
            .limit(1);
        if (!membership)
            return { settings: { workspaceId: null, ...exports.SECURITY_DEFAULTS }, isWorkspaceAdmin: false };
        const settings = await this.get(membership.workspaceId);
        return { settings, isWorkspaceAdmin: membership.role === 'workspace_admin' };
    }
    // ─── Password policy ─────────────────────────────────────────────────────────
    /** Throws BadRequest-style errors via the caller; returns a reason or null. */
    passwordStrengthProblem(password) {
        const missing = [];
        if (password.length < 10)
            missing.push('at least 10 characters');
        if (!/[a-z]/.test(password))
            missing.push('a lowercase letter');
        if (!/[A-Z]/.test(password))
            missing.push('an uppercase letter');
        if (!/[0-9]/.test(password))
            missing.push('a number');
        if (!/[^A-Za-z0-9]/.test(password))
            missing.push('a symbol');
        return missing.length ? `Password must contain ${missing.join(', ')}.` : null;
    }
    /**
     * Check a password against HaveIBeenPwned's k-anonymity range API. Fails
     * OPEN: any network/parse error returns false so the breach check can never
     * block a legitimate sign-up when the API is unreachable (or blocked by the
     * environment's egress policy).
     */
    async isPasswordBreached(password) {
        try {
            const sha1 = (0, node_crypto_1.createHash)('sha1').update(password).digest('hex').toUpperCase();
            const prefix = sha1.slice(0, 5);
            const suffix = sha1.slice(5);
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 2500);
            let text;
            try {
                const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
                    signal: controller.signal,
                    headers: { 'Add-Padding': 'true' },
                });
                if (!res.ok)
                    return false;
                text = await res.text();
            }
            finally {
                clearTimeout(timer);
            }
            for (const line of text.split('\n')) {
                const [hashSuffix] = line.split(':');
                if (hashSuffix.trim().toUpperCase() === suffix)
                    return true;
            }
            return false;
        }
        catch {
            return false;
        }
    }
};
exports.WorkspaceSecuritySettingsService = WorkspaceSecuritySettingsService;
exports.WorkspaceSecuritySettingsService = WorkspaceSecuritySettingsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, security_service_1.SecurityService])
], WorkspaceSecuritySettingsService);
//# sourceMappingURL=workspace-security-settings.service.js.map