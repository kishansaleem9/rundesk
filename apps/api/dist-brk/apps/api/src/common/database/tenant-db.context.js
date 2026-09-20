"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantDbStorage = void 0;
exports.runWithTenantDb = runWithTenantDb;
exports.getTenantDb = getTenantDb;
const node_async_hooks_1 = require("node:async_hooks");
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
exports.tenantDbStorage = new node_async_hooks_1.AsyncLocalStorage();
/**
 * Run `fn` (and everything it awaits) with `db` installed as the request's
 * dedicated database. Async continuations created inside `fn` inherit the
 * context, so an async route handler started here keeps seeing `db` for its
 * whole lifetime. Returns whatever `fn` returns.
 */
function runWithTenantDb(db, fn) {
    return exports.tenantDbStorage.run(db, fn);
}
/**
 * The dedicated `Db` for the current request, or `undefined` when none is
 * installed (the default — no dedicated DB / not a dedicated-DB request).
 */
function getTenantDb() {
    return exports.tenantDbStorage.getStore();
}
//# sourceMappingURL=tenant-db.context.js.map