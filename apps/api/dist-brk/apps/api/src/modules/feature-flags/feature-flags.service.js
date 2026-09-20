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
exports.FeatureFlagsService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const feature_flags_1 = require("@rundesk/feature-flags");
const database_module_1 = require("../../common/database/database.module");
const security_service_1 = require("../security/security.service");
const notifications_service_1 = require("../notifications/notifications.service");
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let FeatureFlagsService = class FeatureFlagsService {
    constructor(db, security, notifications) {
        this.db = db;
        this.security = security;
        this.notifications = notifications;
        // In-process cache: key = `${userId}:${workspaceId}` → resolved flags + expiry
        this.cache = new Map();
    }
    async isEnabled(flagKey, ctx) {
        const resolved = await this.resolveForContext(ctx);
        return resolved[flagKey] ?? false;
    }
    async resolveForContext(ctx) {
        const cacheKey = `${ctx.userId ?? 'anon'}:${ctx.workspaceId ?? 'none'}`;
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now())
            return cached.flags;
        const resolved = await this.resolveFromDb(ctx);
        this.cache.set(cacheKey, { flags: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
        return resolved;
    }
    async resolveForUser(ctx) {
        const flags = await this.resolveForContext(ctx);
        return { flags: flags, resolvedAt: Date.now() };
    }
    /**
     * Resolve flags for the workspace the caller is actually looking at. The
     * frontend passes the route workspaceId so nav gating reflects the viewed
     * workspace rather than only the token's active one. An explicit workspaceId
     * is honoured only when the caller can see it (super_admin, or a member),
     * so feature config can't be probed for arbitrary workspaces; otherwise we
     * fall back to the token's active workspace.
     */
    async resolveForUserRequest(user, requestedWorkspaceId) {
        let workspaceId = user.activeWorkspaceId;
        if (requestedWorkspaceId && requestedWorkspaceId !== user.activeWorkspaceId) {
            if (user.role === 'super_admin') {
                workspaceId = requestedWorkspaceId;
            }
            else {
                const [member] = await this.db
                    .select({ userId: db_1.workspaceMembers.userId })
                    .from(db_1.workspaceMembers)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, requestedWorkspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, user.id)))
                    .limit(1);
                if (member)
                    workspaceId = requestedWorkspaceId;
            }
        }
        return this.resolveForUser({ userId: user.id, workspaceId: workspaceId ?? '', role: user.role ?? '' });
    }
    invalidateCache(userId, workspaceId) {
        if (userId && workspaceId) {
            this.cache.delete(`${userId}:${workspaceId}`);
        }
        else {
            // Invalidate all — used when global or workspace-wide flag changes
            this.cache.clear();
        }
    }
    /**
     * Drop cache entries affected by a flag change. Cache keys are
     * `${userId}:${workspaceId}`, so a workspace-scoped change must clear every
     * user's entry for that workspace (not a single synthetic key) — otherwise a
     * toggle wouldn't take effect until the 5-minute TTL expired.
     */
    invalidateForFlagChange(scope, scopeId, workspaceId) {
        if (scope === 'workspace' && workspaceId) {
            for (const key of [...this.cache.keys()]) {
                if (key.endsWith(`:${workspaceId}`))
                    this.cache.delete(key);
            }
        }
        else if (scope === 'user' && scopeId) {
            for (const key of [...this.cache.keys()]) {
                if (key.startsWith(`${scopeId}:`))
                    this.cache.delete(key);
            }
        }
        else {
            // global / role changes fan out across users — clear everything.
            this.cache.clear();
        }
    }
    async resolveFromDb(ctx) {
        // Start with platform defaults
        const resolved = {};
        for (const flag of feature_flags_1.DEFAULT_ENABLED_FLAGS)
            resolved[flag] = true;
        // Load all relevant overrides in one query, ordered global → workspace → role → user
        const rows = await this.db.select().from(db_1.featureFlags).where(ctx.workspaceId
            ? (0, drizzle_orm_1.eq)(db_1.featureFlags.workspaceId, ctx.workspaceId)
            : (0, drizzle_orm_1.isNull)(db_1.featureFlags.workspaceId));
        // Apply in resolution order: global first, then workspace, role, user (most specific wins)
        const order = ['global', 'workspace', 'role', 'user'];
        for (const scope of order) {
            for (const row of rows.filter((r) => r.scope === scope)) {
                const scopeMatches = scope === 'global' ||
                    (scope === 'workspace' && row.scopeId === ctx.workspaceId) ||
                    (scope === 'role' && row.scopeId === ctx.role) ||
                    (scope === 'user' && row.scopeId === ctx.userId);
                if (scopeMatches)
                    resolved[row.flagKey] = row.enabled;
            }
        }
        return resolved;
    }
    async setFlag(flagKey, enabled, scope, scopeId, workspaceId, actor) {
        // Authorization: global / role / user overrides are platform-wide and
        // require super_admin; workspace overrides require workspace_admin of the
        // target workspace. (The @Roles decorator was never enforced — no RolesGuard
        // existed — so this is the real gate.)
        const isSuperAdmin = actor.role === 'super_admin';
        if (scope === 'workspace') {
            if (!isSuperAdmin) {
                if (!workspaceId)
                    throw new common_1.ForbiddenException('workspaceId is required for workspace-scoped flags');
                const [membership] = await this.db
                    .select({ role: db_1.workspaceMembers.role })
                    .from(db_1.workspaceMembers)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, actor.id)))
                    .limit(1);
                if (!membership || membership.role !== 'workspace_admin') {
                    throw new common_1.ForbiddenException('Workspace admin required to change workspace feature flags');
                }
            }
        }
        else if (!isSuperAdmin) {
            throw new common_1.ForbiddenException('Only a super admin can change global, role, or user feature flags');
        }
        const updatedBy = actor.id;
        await this.db.insert(db_1.featureFlags).values({
            flagKey, scope, scopeId, workspaceId: workspaceId ?? undefined, enabled, updatedBy,
        }).onConflictDoUpdate({
            target: [db_1.featureFlags.flagKey, db_1.featureFlags.scope, db_1.featureFlags.scopeId, db_1.featureFlags.workspaceId],
            set: { enabled, updatedBy, updatedAt: new Date() },
        });
        this.invalidateForFlagChange(scope, scopeId, workspaceId);
        await this.security.logAuditEvent({
            workspaceId: workspaceId ?? undefined,
            actorId: updatedBy,
            action: 'feature_flag.changed',
            resourceType: 'feature_flag',
            resourceId: flagKey,
            description: `Feature flag "${flagKey}" set to ${enabled ? 'on' : 'off'} (${scope})`,
            metadata: { flagKey, enabled, scope, scopeId: scopeId ?? null },
        });
    }
    /**
     * §2.8 gap 11 — "Contact your admin", made into something that happens.
     *
     *   `[20:45]` recording "back end se on karna parta hai" — the capability is
     *   off until an admin turns it on, and the person who wants it is not that
     *   admin.
     *
     * The modal that explains this ends in a button. A button that opens a mail
     * client is a button that does nothing on a machine with no mail client set
     * up, so this asks the admins directly, in the app they are already in.
     *
     * Returns what actually happened rather than a bare 200: whether the flag was
     * already on (nothing to ask for), whether this person had already asked
     * today, and how many admins were told.
     */
    async requestFlag(flagKey, workspaceId, requester) {
        if (!Object.values(feature_flags_1.FLAGS).includes(flagKey)) {
            throw new common_1.BadRequestException(`Unknown feature "${flagKey}"`);
        }
        const [membership] = await this.db
            .select({ role: db_1.workspaceMembers.role })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.workspaceMembers.userId, requester.id)))
            .limit(1);
        if (!membership)
            throw new common_1.ForbiddenException('Not a member of this workspace');
        // Asking for something you already have would send an admin chasing a
        // toggle that is already on.
        const resolved = await this.resolveForContext({
            userId: requester.id,
            workspaceId,
            role: membership.role,
        });
        if (resolved[flagKey] === true)
            return { status: 'already_enabled', notified: 0 };
        const admins = await this.db
            .select({ userId: db_1.workspaceMembers.userId })
            .from(db_1.workspaceMembers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.workspaceMembers.workspaceId, workspaceId), (0, drizzle_orm_1.inArray)(db_1.workspaceMembers.role, ['workspace_admin', 'super_admin'])));
        const recipients = admins.map((a) => a.userId).filter((id) => id !== requester.id);
        if (recipients.length === 0)
            return { status: 'no_admins', notified: 0 };
        /*
         * One ask per person per feature per day. Pressing a button twice is not
         * two requests, and an admin's bell is not a place to leave a drum roll.
         *
         * Read from the ASKS, not from the notifications they produced. A
         * notification row is only written for an admin with an in-app channel
         * switched on, so in a workspace whose admins run email-only there was
         * never a row to find: the rule never tripped and every reload mailed all
         * of them again. What the rule is about is the press, so that is what it
         * now looks at.
         */
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [recent] = await this.db
            .select({ id: db_1.featureFlagRequests.id })
            .from(db_1.featureFlagRequests)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.featureFlagRequests.workspaceId, workspaceId), (0, drizzle_orm_1.eq)(db_1.featureFlagRequests.requesterId, requester.id), (0, drizzle_orm_1.eq)(db_1.featureFlagRequests.flagKey, flagKey), (0, drizzle_orm_1.gte)(db_1.featureFlagRequests.createdAt, since)))
            .limit(1);
        if (recent)
            return { status: 'already_asked', notified: 0 };
        // Recorded BEFORE the fan-out, so a request that dies partway through is
        // still an ask that happened rather than one that can be repeated at will.
        await this.db
            .insert(db_1.featureFlagRequests)
            .values({ workspaceId, flagKey, requesterId: requester.id })
            .catch(() => undefined);
        const who = requester.name?.trim() || requester.email || 'Someone';
        let notified = 0;
        for (const userId of recipients) {
            const outcome = await this.notifications.createWithOutcome({
                userId,
                workspaceId,
                actorId: requester.id,
                type: 'access_requested',
                title: `${who} asked for ${flagKey}`,
                body: `${who} tried to use a feature this workspace has turned off. You can turn "${flagKey}" on in Admin → Features.`,
                target: { entityType: 'feature_flag', entityId: flagKey, url: `/app/admin/features` },
            });
            /*
             * DELIVERY, not the row.
             *
             * create() returns the in-app row, and that is null for somebody who has
             * turned in-app off and left email on — a supported combination. Counting
             * rows therefore counted an admin who got the email as nobody, and told
             * the requester "nobody was told" while every admin had the mail. It also
             * meant the once-a-day rule never tripped for them, so they could be
             * emailed again on every press.
             *
             * Muting every channel is still a real zero: that is their choice, and
             * the caller is entitled to know the difference.
             */
            if (outcome?.delivered)
                notified++;
        }
        return { status: 'sent', notified };
    }
    async listOverrides(workspaceId) {
        const rows = await this.db
            .select()
            .from(db_1.featureFlags)
            .where(workspaceId
            ? (0, drizzle_orm_1.eq)(db_1.featureFlags.workspaceId, workspaceId)
            : (0, drizzle_orm_1.isNull)(db_1.featureFlags.workspaceId));
        return rows.sort((a, b) => {
            const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return bt - at;
        });
    }
};
exports.FeatureFlagsService = FeatureFlagsService;
exports.FeatureFlagsService = FeatureFlagsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, security_service_1.SecurityService,
        notifications_service_1.NotificationsService])
], FeatureFlagsService);
//# sourceMappingURL=feature-flags.service.js.map