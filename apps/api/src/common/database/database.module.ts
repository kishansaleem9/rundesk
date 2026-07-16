import { Module, Global } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { getDb } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { getTenantDb } from './tenant-db.context'

/** The transparent, tenant-aware DB proxy every module injects. */
export const DB_TOKEN = 'DRIZZLE_DB'
/**
 * The raw SHARED drizzle handle (never proxied). Injected by infrastructure that
 * must always talk to the shared cluster regardless of request context — e.g.
 * the tenant-DB registry lookups and the request interceptor's org resolution.
 */
export const SHARED_DB_TOKEN = 'DRIZZLE_SHARED_DB'

/**
 * §14.2 — wrap the shared drizzle `Db` in a transparent proxy that, on EVERY
 * property access, resolves the target at call time to the request's dedicated
 * database (`getTenantDb()`) when one is installed, else the shared handle.
 *
 * Because resolution happens per-access, a single injected value routes each
 * request to the right Postgres with zero changes to the 55 feature modules.
 * When the request-scoped store is empty — the default for every existing test
 * and every non-dedicated request — the proxy forwards to `sharedDb`, so
 * behaviour is byte-identical to injecting the shared handle directly.
 *
 * Everything drizzle exposes is forwarded correctly:
 *  - query-builder methods (`select` / `insert` / `update` / `delete` /
 *    `execute` / `transaction` / `$with` / `with` …) are bound to the resolved
 *    target so `this` — and drizzle's private fields — resolve against the real
 *    handle (never the proxy);
 *  - the relational `db.query.*` namespace is a plain object read straight off
 *    the resolved target, so `db.query.users.findMany(...)` runs against the
 *    right database;
 *  - `db.transaction(fn)` is bound to the resolved target, so the whole
 *    transaction — and the `tx` handle drizzle passes into `fn` — belongs to
 *    that database.
 */
export function createTenantAwareDb(sharedDb: Db): Db {
  return new Proxy(sharedDb, {
    get(_target, prop) {
      // Resolve the live target on every access: the request's dedicated db when
      // one is installed for this async context, otherwise the shared handle.
      const target = getTenantDb() ?? sharedDb
      const value = Reflect.get(target, prop, target)
      // Bind methods to the resolved target so `this` (and drizzle's private
      // state) points at the real handle rather than at this proxy.
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
    },
  }) as Db
}

@Global()
@Module({
  providers: [
    {
      // Raw shared handle — one pooled connection to the shared cluster.
      provide: SHARED_DB_TOKEN,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => getDb(config.getOrThrow('DATABASE_URL')),
    },
    {
      // Tenant-aware proxy over the shared handle. This is what feature modules
      // inject; it transparently routes to a dedicated db when one is active for
      // the current request, else the shared handle.
      provide: DB_TOKEN,
      inject: [SHARED_DB_TOKEN],
      useFactory: (sharedDb: Db) => createTenantAwareDb(sharedDb),
    },
  ],
  exports: [DB_TOKEN, SHARED_DB_TOKEN],
})
export class DatabaseModule {}
