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
var TenantDbInterceptor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantDbInterceptor = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("./database.module");
const tenant_db_context_1 = require("./tenant-db.context");
const tenant_databases_service_1 = require("../../modules/tenant-databases/tenant-databases.service");
/**
 * §14.2 — per-request dedicated-database routing.
 *
 * For each HTTP request this interceptor decides which Postgres the request's
 * queries should run against and, when that is a dedicated database, runs the
 * remainder of the request inside `runWithTenantDb(db, …)` so the transparent
 * DB proxy (see database.module.ts) routes every query there — without any of
 * the feature modules being aware of it.
 *
 * SAFE BY DEFAULT. The common case — no org has an ACTIVE `tenant_databases`
 * row — is a near-no-op: a single cached boolean short-circuits before touching
 * the request, the request is NEVER wrapped, the async store stays empty and
 * the proxy forwards to the shared cluster. Behaviour is byte-identical to not
 * having this interceptor. It never throws: any failure falls through to shared.
 */
let TenantDbInterceptor = TenantDbInterceptor_1 = class TenantDbInterceptor {
    constructor(sharedDb, tenantDbs) {
        this.sharedDb = sharedDb;
        this.tenantDbs = tenantDbs;
        // "Is ANY dedicated database configured?" — cached with a short TTL so the
        // overwhelmingly-common no-dedicated-DB case costs one boolean check, not a
        // query, per request.
        this.anyActive = null;
        // workspaceId -> organizationId, cached briefly (the mapping is effectively
        // immutable for the life of a workspace).
        this.wsOrg = new Map();
        // organizationId -> resolved dedicated handle (or null = shared/none), cached
        // briefly so a burst of requests for the same org doesn't re-run the resolver.
        this.orgDb = new Map();
    }
    intercept(context, next) {
        // Only HTTP requests carry a per-request DB context; skip WS/RPC/etc.
        if (context.getType() !== 'http')
            return next.handle();
        return this.resolve(context).then((db) => {
            // No dedicated database for this request — run on the shared cluster with
            // an EMPTY store, exactly as before this feature existed.
            if (!db)
                return next.handle();
            // Install the dedicated handle for the whole (async) request lifetime.
            return new rxjs_1.Observable((subscriber) => {
                (0, tenant_db_context_1.runWithTenantDb)(db, () => {
                    next.handle().subscribe(subscriber);
                });
            });
        });
    }
    /**
     * Resolve the dedicated `Db` this request must use, or `undefined` for the
     * shared cluster. Never throws — every failure resolves to `undefined`.
     */
    async resolve(context) {
        try {
            // Fast path: nothing configured anywhere -> never touch the request.
            if (!(await this.hasAnyActive()))
                return undefined;
            const req = context.switchToHttp().getRequest();
            const orgId = await this.resolveOrgId(req);
            if (!orgId)
                return undefined;
            const db = await this.dbForOrg(orgId);
            return db ?? undefined;
        }
        catch {
            // Resolution must never break a request; fall through to shared.
            return undefined;
        }
    }
    /** Cached "is any dedicated DB active?" flag (shared-cluster query). */
    async hasAnyActive() {
        const now = Date.now();
        if (this.anyActive && this.anyActive.expires > now)
            return this.anyActive.value;
        let value = false;
        try {
            const rows = await this.sharedDb
                .select({ id: db_1.tenantDatabases.id })
                .from(db_1.tenantDatabases)
                .where((0, drizzle_orm_1.eq)(db_1.tenantDatabases.status, 'active'))
                .limit(1);
            value = rows.length > 0;
        }
        catch {
            value = false;
        }
        this.anyActive = { value, expires: now + TenantDbInterceptor_1.ANY_ACTIVE_TTL_MS };
        return value;
    }
    /**
     * Derive the request's organization id from (in order): an explicit
     * `:organizationId` route param, the `:workspaceId` route param resolved to
     * its org, or the authenticated user's active workspace resolved to its org.
     */
    async resolveOrgId(req) {
        const orgParam = req?.params?.organizationId;
        if (orgParam)
            return orgParam;
        const wsId = req?.params?.workspaceId;
        if (wsId) {
            const org = await this.orgForWorkspace(wsId);
            if (org)
                return org;
        }
        const userWsId = req?.user?.activeWorkspaceId;
        if (userWsId) {
            const org = await this.orgForWorkspace(userWsId);
            if (org)
                return org;
        }
        return null;
    }
    /** Cached workspaceId -> organizationId (shared-cluster query). */
    async orgForWorkspace(workspaceId) {
        const now = Date.now();
        const cached = this.wsOrg.get(workspaceId);
        if (cached && cached.expires > now)
            return cached.orgId;
        let orgId = null;
        try {
            const [row] = await this.sharedDb
                .select({ organizationId: db_1.workspaces.organizationId })
                .from(db_1.workspaces)
                .where((0, drizzle_orm_1.eq)(db_1.workspaces.id, workspaceId))
                .limit(1);
            orgId = row?.organizationId ?? null;
        }
        catch {
            orgId = null;
        }
        this.wsOrg.set(workspaceId, { orgId, expires: now + TenantDbInterceptor_1.WS_ORG_TTL_MS });
        return orgId;
    }
    /**
     * Cached org -> dedicated handle. Returns the dedicated `Db` when the org has
     * an ACTIVE mapping, or `null` for the shared cluster. A handle equal to the
     * shared db (e.g. a dedicated DSN that points back at shared) collapses to
     * `null` so we never wrap the request needlessly.
     */
    async dbForOrg(orgId) {
        const now = Date.now();
        const cached = this.orgDb.get(orgId);
        if (cached && cached.expires > now)
            return cached.db;
        let db = null;
        try {
            const resolved = await this.tenantDbs.getDbForOrganization(orgId);
            db = resolved === this.sharedDb ? null : resolved;
        }
        catch {
            db = null;
        }
        this.orgDb.set(orgId, { db, expires: now + TenantDbInterceptor_1.ORG_DB_TTL_MS });
        return db;
    }
};
exports.TenantDbInterceptor = TenantDbInterceptor;
TenantDbInterceptor.ANY_ACTIVE_TTL_MS = 5_000;
TenantDbInterceptor.WS_ORG_TTL_MS = 30_000;
TenantDbInterceptor.ORG_DB_TTL_MS = 5_000;
exports.TenantDbInterceptor = TenantDbInterceptor = TenantDbInterceptor_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.SHARED_DB_TOKEN)),
    __metadata("design:paramtypes", [Object, tenant_databases_service_1.TenantDatabasesService])
], TenantDbInterceptor);
//# sourceMappingURL=tenant-db.interceptor.js.map