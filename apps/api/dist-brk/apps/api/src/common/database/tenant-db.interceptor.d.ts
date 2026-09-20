import { NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { Db } from '@rundesk/db';
import { TenantDatabasesService } from '../../modules/tenant-databases/tenant-databases.service';
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
export declare class TenantDbInterceptor implements NestInterceptor {
    private readonly sharedDb;
    private readonly tenantDbs;
    private anyActive;
    private static readonly ANY_ACTIVE_TTL_MS;
    private readonly wsOrg;
    private static readonly WS_ORG_TTL_MS;
    private readonly orgDb;
    private static readonly ORG_DB_TTL_MS;
    constructor(sharedDb: Db, tenantDbs: TenantDatabasesService);
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> | Promise<Observable<unknown>>;
    /**
     * Resolve the dedicated `Db` this request must use, or `undefined` for the
     * shared cluster. Never throws — every failure resolves to `undefined`.
     */
    private resolve;
    /** Cached "is any dedicated DB active?" flag (shared-cluster query). */
    private hasAnyActive;
    /**
     * Derive the request's organization id from (in order): an explicit
     * `:organizationId` route param, the `:workspaceId` route param resolved to
     * its org, or the authenticated user's active workspace resolved to its org.
     */
    private resolveOrgId;
    /** Cached workspaceId -> organizationId (shared-cluster query). */
    private orgForWorkspace;
    /**
     * Cached org -> dedicated handle. Returns the dedicated `Db` when the org has
     * an ACTIVE mapping, or `null` for the shared cluster. A handle equal to the
     * shared db (e.g. a dedicated DSN that points back at shared) collapses to
     * `null` so we never wrap the request needlessly.
     */
    private dbForOrg;
}
