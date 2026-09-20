import { AsyncLocalStorage } from 'node:async_hooks';
import type { Db } from '@rundesk/db';
/**
 * §14.2 — request-scoped dedicated-database context.
 *
 * Holds the `Db` handle the CURRENT request's queries should run against. When
 * an enterprise org has an ACTIVE `tenant_databases` row, the request-scoped
 * interceptor (see tenant-db.interceptor.ts) resolves that org's dedicated
 * handle and runs the remainder of the request inside `runWithTenantDb`, so the
 * transparent DB proxy (see database.module.ts) transparently routes every
 * query to the dedicated Postgres — without any of the 55 feature modules
 * knowing about it.
 *
 * The store is EMPTY by default. Every existing test and every non-dedicated
 * request leaves it empty, in which case `getTenantDb()` returns `undefined`
 * and the proxy forwards to the shared cluster — behaviour is unchanged.
 */
export declare const tenantDbStorage: AsyncLocalStorage<Db>;
/**
 * Run `fn` (and everything it awaits) with `db` installed as the request's
 * dedicated database. Async continuations created inside `fn` inherit the
 * context, so an async route handler started here keeps seeing `db` for its
 * whole lifetime. Returns whatever `fn` returns.
 */
export declare function runWithTenantDb<T>(db: Db, fn: () => T): T;
/**
 * The dedicated `Db` for the current request, or `undefined` when none is
 * installed (the default — no dedicated DB / not a dedicated-DB request).
 */
export declare function getTenantDb(): Db | undefined;
