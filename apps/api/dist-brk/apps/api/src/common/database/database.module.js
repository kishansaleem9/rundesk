"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseModule = exports.SHARED_DB_TOKEN = exports.DB_TOKEN = void 0;
exports.createTenantAwareDb = createTenantAwareDb;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const db_1 = require("@rundesk/db");
const tenant_db_context_1 = require("./tenant-db.context");
/** The transparent, tenant-aware DB proxy every module injects. */
exports.DB_TOKEN = 'DRIZZLE_DB';
/**
 * The raw SHARED drizzle handle (never proxied). Injected by infrastructure that
 * must always talk to the shared cluster regardless of request context — e.g.
 * the tenant-DB registry lookups and the request interceptor's org resolution.
 */
exports.SHARED_DB_TOKEN = 'DRIZZLE_SHARED_DB';
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
function createTenantAwareDb(sharedDb) {
    return new Proxy(sharedDb, {
        get(_target, prop) {
            // Resolve the live target on every access: the request's dedicated db when
            // one is installed for this async context, otherwise the shared handle.
            const target = (0, tenant_db_context_1.getTenantDb)() ?? sharedDb;
            const value = Reflect.get(target, prop, target);
            // Bind methods to the resolved target so `this` (and drizzle's private
            // state) points at the real handle rather than at this proxy.
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}
let DatabaseModule = class DatabaseModule {
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [
            {
                // Raw shared handle — one pooled connection to the shared cluster.
                provide: exports.SHARED_DB_TOKEN,
                inject: [config_1.ConfigService],
                useFactory: (config) => (0, db_1.getDb)(config.getOrThrow('DATABASE_URL')),
            },
            {
                // Tenant-aware proxy over the shared handle. This is what feature modules
                // inject; it transparently routes to a dedicated db when one is active for
                // the current request, else the shared handle.
                provide: exports.DB_TOKEN,
                inject: [exports.SHARED_DB_TOKEN],
                useFactory: (sharedDb) => createTenantAwareDb(sharedDb),
            },
        ],
        exports: [exports.DB_TOKEN, exports.SHARED_DB_TOKEN],
    })
], DatabaseModule);
//# sourceMappingURL=database.module.js.map