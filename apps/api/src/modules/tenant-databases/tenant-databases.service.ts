import { Injectable, Inject } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'
import { getDb, tenantDatabases } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

export type TenantDatabaseStatus = 'pending' | 'active' | 'disabled'

/**
 * Masked, client-safe projection of a `tenant_databases` row. The raw
 * `connectionUrl` is a server-only secret and is NEVER included here — callers
 * see only the status, an optional label, a masked `host` (host:port) and the
 * last health-check timestamp.
 */
export type TenantDatabaseView = {
  organizationId: string
  status: TenantDatabaseStatus
  label: string | null
  host: string
  lastCheckedAt: Date | null
}

export type TestConnectionResult =
  | { ok: true; status: TenantDatabaseStatus; latencyMs: number }
  | { ok: false; status: TenantDatabaseStatus; error: string }

/**
 * §14.2 — optional dedicated-database tier for enterprise. Owns the registry of
 * org → dedicated Postgres mappings and the connection resolver that routes an
 * org's queries to its own database (when `active`) or the shared cluster.
 *
 * The injected `db` is the SHARED database — it holds the `tenant_databases`
 * registry itself. Dedicated handles are opened lazily via `getDb(connectionUrl)`.
 */
@Injectable()
export class TenantDatabasesService {
  /**
   * Per-organization cache of dedicated `Db` handles. `getDb(connectionUrl)`
   * opens a connection pool, so we memoize the handle per org to avoid
   * recreating a pool on every resolve. Invalidated whenever the row's
   * connection or status changes (upsert / disable / remove / failed test).
   */
  private readonly handles = new Map<string, Db>()

  constructor(@Inject(DB_TOKEN) private db: Db) {}

  // ---- Registry CRUD (super-admin only; the gate is enforced in the controller)

  /** All registry entries, masked. Never exposes any raw connection string. */
  async listAll(): Promise<TenantDatabaseView[]> {
    const rows = await this.db.select().from(tenantDatabases)
    return rows.map((row) => this.toView(row))
  }

  /** A single org's registry entry, masked, or null when none is configured. */
  async getForOrg(orgId: string): Promise<TenantDatabaseView | null> {
    const [row] = await this.db
      .select()
      .from(tenantDatabases)
      .where(eq(tenantDatabases.organizationId, orgId))
      .limit(1)
    return row ? this.toView(row) : null
  }

  /** Create or replace an org's dedicated-database mapping. Returns the masked view. */
  async upsertForOrg(
    orgId: string,
    input: { connectionUrl: string; label?: string | null; status?: TenantDatabaseStatus },
  ): Promise<TenantDatabaseView> {
    const status: TenantDatabaseStatus = input.status ?? 'pending'
    const label = input.label ?? null
    const [row] = await this.db
      .insert(tenantDatabases)
      .values({ organizationId: orgId, connectionUrl: input.connectionUrl, label, status })
      .onConflictDoUpdate({
        target: tenantDatabases.organizationId,
        set: { connectionUrl: input.connectionUrl, label, status, updatedAt: new Date() },
      })
      .returning()
    // The connection may have changed — drop any cached handle for this org.
    this.handles.delete(orgId)
    return this.toView(row)
  }

  /** Flip an org's mapping to `disabled` (stops routing) without deleting it. */
  async disable(orgId: string): Promise<TenantDatabaseView | null> {
    const [row] = await this.db
      .update(tenantDatabases)
      .set({ status: 'disabled', updatedAt: new Date() })
      .where(eq(tenantDatabases.organizationId, orgId))
      .returning()
    this.handles.delete(orgId)
    return row ? this.toView(row) : null
  }

  /** Permanently remove an org's mapping and drop any cached handle. */
  async remove(orgId: string): Promise<{ ok: true }> {
    await this.db.delete(tenantDatabases).where(eq(tenantDatabases.organizationId, orgId))
    this.handles.delete(orgId)
    return { ok: true }
  }

  // ---- Connection resolver -------------------------------------------------

  /**
   * Resolve the `Db` handle an organization's queries should run against.
   *
   * If an ACTIVE `tenant_databases` row exists, returns a dedicated
   * `getDb(connectionUrl)` handle (cached per-org so the pool is reused);
   * otherwise falls back to the SHARED db. This is the routing foundation:
   * per-request routing is OPT-IN (callers choose to consult this resolver) and
   * moving an org's existing rows onto its dedicated database is a separate OPS
   * step — flipping a mapping to `active` only changes where NEW queries are
   * sent, it does not migrate data.
   */
  async getDbForOrganization(orgId: string): Promise<Db> {
    const cached = this.handles.get(orgId)
    if (cached) return cached

    const [row] = await this.db
      .select()
      .from(tenantDatabases)
      .where(and(eq(tenantDatabases.organizationId, orgId), eq(tenantDatabases.status, 'active')))
      .limit(1)

    // No active dedicated database — stay on the shared cluster. We intentionally
    // do NOT cache this fallback so a later activation is picked up immediately.
    if (!row) return this.db

    const handle = getDb(row.connectionUrl)
    this.handles.set(orgId, handle)
    return handle
  }

  /**
   * Connect to the org's dedicated database and run `select 1`, updating
   * `status`/`lastCheckedAt` accordingly (active on success, disabled on
   * failure). Never throws to the caller — always resolves to a result object.
   */
  async testConnection(orgId: string): Promise<TestConnectionResult> {
    const start = Date.now()
    try {
      const [row] = await this.db
        .select()
        .from(tenantDatabases)
        .where(eq(tenantDatabases.organizationId, orgId))
        .limit(1)
      if (!row) {
        return { ok: false, status: 'pending', error: 'No dedicated database configured for this organization' }
      }
      const handle = getDb(row.connectionUrl)
      try {
        await handle.execute(sql`select 1`)
      } catch (err) {
        // Connection is unhealthy — drop the cached handle and mark it disabled.
        this.handles.delete(orgId)
        await this.markStatus(orgId, 'disabled').catch(() => undefined)
        return { ok: false, status: 'disabled', error: (err as Error).message }
      }
      this.handles.set(orgId, handle)
      await this.markStatus(orgId, 'active')
      return { ok: true, status: 'active', latencyMs: Date.now() - start }
    } catch (err) {
      // Registry lookup / status write failed on the shared db — still never throw.
      return { ok: false, status: 'pending', error: (err as Error).message }
    }
  }

  // ---- helpers -------------------------------------------------------------

  private async markStatus(orgId: string, status: TenantDatabaseStatus): Promise<void> {
    await this.db
      .update(tenantDatabases)
      .set({ status, lastCheckedAt: new Date(), updatedAt: new Date() })
      .where(eq(tenantDatabases.organizationId, orgId))
  }

  /** Project a row to the masked, client-safe view. NEVER exposes connectionUrl. */
  private toView(row: typeof tenantDatabases.$inferSelect): TenantDatabaseView {
    return {
      organizationId: row.organizationId,
      status: row.status as TenantDatabaseStatus,
      label: row.label,
      host: maskConnectionHost(row.connectionUrl),
      lastCheckedAt: row.lastCheckedAt,
    }
  }
}

/**
 * Reduce a Postgres DSN to just its `host:port` so the registry can show which
 * server an org points at without ever leaking credentials or the database
 * name. Unparseable values collapse to `***`.
 */
export function maskConnectionHost(connectionUrl: string): string {
  try {
    const url = new URL(connectionUrl)
    return url.host || '***'
  } catch {
    return '***'
  }
}
