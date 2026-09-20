"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const database_module_1 = require("./database.module");
const tenant_db_context_1 = require("./tenant-db.context");
/**
 * Mock drizzle-shaped handle. Each query-builder method records the `this` it
 * was invoked with, so a test can prove the proxy bound the call to the RIGHT
 * target (shared vs a request-scoped dedicated db) — not just that it returned
 * a value.
 */
function makeMockDb(name, log) {
    const db = {
        name,
        select() {
            log.push(`select@${this.name}`);
            return { __from: this.name };
        },
        async transaction(fn) {
            log.push(`transaction@${this.name}`);
            // drizzle passes a transaction-scoped handle straight into fn (it does not
            // go through our proxy); model that here.
            return fn({ tx: this.name });
        },
        // relational query namespace (db.query.*) — a plain object, not a function.
        query: {
            users: {
                findMany() {
                    log.push(`query.users.findMany@${name}`);
                    return Promise.resolve([`row-from-${name}`]);
                },
            },
        },
    };
    return db;
}
(0, node_test_1.describe)('tenant-aware DB proxy (§14.2)', () => {
    (0, node_test_1.it)('(a) forwards to the SHARED db when the async store is empty', () => {
        const log = [];
        const shared = makeMockDb('shared', log);
        const proxy = (0, database_module_1.createTenantAwareDb)(shared);
        strict_1.default.equal((0, tenant_db_context_1.getTenantDb)(), undefined, 'precondition: no tenant db installed');
        const result = proxy.select();
        strict_1.default.equal(result.__from, 'shared', 'query builder resolved against the shared target');
        strict_1.default.deepEqual(log, ['select@shared'], 'method bound to the shared target');
    });
    (0, node_test_1.it)('(b) forwards to the dedicated db inside runWithTenantDb(otherDb, …)', () => {
        const log = [];
        const shared = makeMockDb('shared', log);
        const other = makeMockDb('other', log);
        const proxy = (0, database_module_1.createTenantAwareDb)(shared);
        const result = (0, tenant_db_context_1.runWithTenantDb)(other, () => proxy.select());
        strict_1.default.equal(result.__from, 'other', 'query builder resolved against the dedicated target');
        strict_1.default.deepEqual(log, ['select@other'], 'method bound to the dedicated target');
    });
    (0, node_test_1.it)('resolves per-access and reverts to shared once the scope exits', () => {
        const log = [];
        const shared = makeMockDb('shared', log);
        const other = makeMockDb('other', log);
        const proxy = (0, database_module_1.createTenantAwareDb)(shared);
        (0, tenant_db_context_1.runWithTenantDb)(other, () => proxy.select());
        proxy.select(); // back outside the scope -> shared again
        strict_1.default.deepEqual(log, ['select@other', 'select@shared']);
    });
    (0, node_test_1.it)('binds db.transaction to the resolved target', async () => {
        const log = [];
        const shared = makeMockDb('shared', log);
        const other = makeMockDb('other', log);
        const proxy = (0, database_module_1.createTenantAwareDb)(shared);
        const outside = (await proxy.transaction(async (tx) => tx));
        const inside = (await (0, tenant_db_context_1.runWithTenantDb)(other, () => proxy.transaction(async (tx) => tx)));
        strict_1.default.equal(outside.tx, 'shared', 'transaction on shared uses the shared handle');
        strict_1.default.equal(inside.tx, 'other', 'transaction inside the scope uses the dedicated handle');
        strict_1.default.deepEqual(log, ['transaction@shared', 'transaction@other']);
    });
    (0, node_test_1.it)('routes the relational db.query.* namespace to the resolved target', async () => {
        const log = [];
        const shared = makeMockDb('shared', log);
        const other = makeMockDb('other', log);
        const proxy = (0, database_module_1.createTenantAwareDb)(shared);
        const fromShared = await proxy.query.users.findMany();
        const fromOther = await (0, tenant_db_context_1.runWithTenantDb)(other, () => proxy.query.users.findMany());
        strict_1.default.deepEqual(fromShared, ['row-from-shared']);
        strict_1.default.deepEqual(fromOther, ['row-from-other']);
    });
});
//# sourceMappingURL=tenant-db.proxy.test.js.map