import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Inject } from '@nestjs/common'
import { Observable } from 'rxjs'
import { eq } from 'drizzle-orm'
import { tenantDatabases, workspaces } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { SHARED_DB_TOKEN } from './database.module'
import { runWithTenantDb } from './tenant-db.context'
import { TenantDatabasesService } from '../../modules/tenant-databases/tenant-databases.service'

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
@Injectable()
export class TenantDbInterceptor implements NestInterceptor {
  // "Is ANY dedicated database configured?" — cached with a short TTL so the
  // overwhelmingly-common no-dedicated-DB case costs one boolean check, not a
  // query, per request.
  private anyActive: { value: boolean; expires: number } | null = null
  private static readonly ANY_ACTIVE_TTL_MS = 5_000

  // workspaceId -> organizationId, cached briefly (the mapping is effectively
  // immutable for the life of a workspace).
  private readonly wsOrg = new Map<string, { orgId: string | null; expires: number }>()
  private static readonly WS_ORG_TTL_MS = 30_000

  // organizationId -> resolved dedicated handle (or null = shared/none), cached
  // briefly so a burst of requests for the same org doesn't re-run the resolver.
  private readonly orgDb = new Map<string, { db: Db | null; expires: number }>()
  private static readonly ORG_DB_TTL_MS = 5_000

  constructor(
    // Raw shared handle — registry + workspace lookups must always hit shared,
    // never a dedicated database, and never recurse through the proxy.
    @Inject(SHARED_DB_TOKEN) private readonly sharedDb: Db,
    private readonly tenantDbs: TenantDatabasesService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> | Promise<Observable<unknown>> {
    // Only HTTP requests carry a per-request DB context; skip WS/RPC/etc.
    if (context.getType() !== 'http') return next.handle()
    return this.resolve(context).then((db) => {
      // No dedicated database for this request — run on the shared cluster with
      // an EMPTY store, exactly as before this feature existed.
      if (!db) return next.handle()
      // Install the dedicated handle for the whole (async) request lifetime.
      return new Observable<unknown>((subscriber) => {
        runWithTenantDb(db, () => {
          next.handle().subscribe(subscriber)
        })
      })
    })
  }

  /**
   * Resolve the dedicated `Db` this request must use, or `undefined` for the
   * shared cluster. Never throws — every failure resolves to `undefined`.
   */
  private async resolve(context: ExecutionContext): Promise<Db | undefined> {
    try {
      // Fast path: nothing configured anywhere -> never touch the request.
      if (!(await this.hasAnyActive())) return undefined

      const req = context.switchToHttp().getRequest()
      const orgId = await this.resolveOrgId(req)
      if (!orgId) return undefined

      const db = await this.dbForOrg(orgId)
      return db ?? undefined
    } catch {
      // Resolution must never break a request; fall through to shared.
      return undefined
    }
  }

  /** Cached "is any dedicated DB active?" flag (shared-cluster query). */
  private async hasAnyActive(): Promise<boolean> {
    const now = Date.now()
    if (this.anyActive && this.anyActive.expires > now) return this.anyActive.value
    let value = false
    try {
      const rows = await this.sharedDb
        .select({ id: tenantDatabases.id })
        .from(tenantDatabases)
        .where(eq(tenantDatabases.status, 'active'))
        .limit(1)
      value = rows.length > 0
    } catch {
      value = false
    }
    this.anyActive = { value, expires: now + TenantDbInterceptor.ANY_ACTIVE_TTL_MS }
    return value
  }

  /**
   * Derive the request's organization id from (in order): an explicit
   * `:organizationId` route param, the `:workspaceId` route param resolved to
   * its org, or the authenticated user's active workspace resolved to its org.
   */
  private async resolveOrgId(req: {
    params?: Record<string, string | undefined>
    user?: { activeWorkspaceId?: string }
  }): Promise<string | null> {
    const orgParam = req?.params?.organizationId
    if (orgParam) return orgParam

    const wsId = req?.params?.workspaceId
    if (wsId) {
      const org = await this.orgForWorkspace(wsId)
      if (org) return org
    }

    const userWsId = req?.user?.activeWorkspaceId
    if (userWsId) {
      const org = await this.orgForWorkspace(userWsId)
      if (org) return org
    }

    return null
  }

  /** Cached workspaceId -> organizationId (shared-cluster query). */
  private async orgForWorkspace(workspaceId: string): Promise<string | null> {
    const now = Date.now()
    const cached = this.wsOrg.get(workspaceId)
    if (cached && cached.expires > now) return cached.orgId
    let orgId: string | null = null
    try {
      const [row] = await this.sharedDb
        .select({ organizationId: workspaces.organizationId })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1)
      orgId = row?.organizationId ?? null
    } catch {
      orgId = null
    }
    this.wsOrg.set(workspaceId, { orgId, expires: now + TenantDbInterceptor.WS_ORG_TTL_MS })
    return orgId
  }

  /**
   * Cached org -> dedicated handle. Returns the dedicated `Db` when the org has
   * an ACTIVE mapping, or `null` for the shared cluster. A handle equal to the
   * shared db (e.g. a dedicated DSN that points back at shared) collapses to
   * `null` so we never wrap the request needlessly.
   */
  private async dbForOrg(orgId: string): Promise<Db | null> {
    const now = Date.now()
    const cached = this.orgDb.get(orgId)
    if (cached && cached.expires > now) return cached.db
    let db: Db | null = null
    try {
      const resolved = await this.tenantDbs.getDbForOrganization(orgId)
      db = resolved === this.sharedDb ? null : resolved
    } catch {
      db = null
    }
    this.orgDb.set(orgId, { db, expires: now + TenantDbInterceptor.ORG_DB_TTL_MS })
    return db
  }
}
