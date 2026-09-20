"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const db_1 = require("@rundesk/db");
const ops_service_1 = require("./ops.service");
/**
 * A drizzle-shaped fake DB that answers each select() by its `.from(table)`.
 * The query chain (from/innerJoin/leftJoin/where/groupBy/orderBy) is a no-op
 * that finally resolves to `rowsFor(table)`. No real Postgres is touched, so
 * every branch is exercised purely in memory.
 */
function makeDb(rowsFor = () => []) {
    const db = {
        select: (_cols) => {
            const chain = { _table: null };
            chain.from = (t) => {
                chain._table = t;
                return chain;
            };
            chain.innerJoin = () => chain;
            chain.leftJoin = () => chain;
            chain.where = () => chain;
            chain.groupBy = () => chain;
            chain.orderBy = () => chain;
            chain.then = (res, rej) => Promise.resolve(rowsFor(chain._table)).then(res, rej);
            return chain;
        },
    };
    return db;
}
(0, node_test_1.describe)('OpsService.getMetrics — revenue math', () => {
    (0, node_test_1.it)('MRR = seatPrice(pro=12) × seats for one active subscription', async () => {
        const N = 3;
        const db = makeDb((table) => {
            if (table === db_1.subscriptions)
                return [{ workspaceId: 'w1', status: 'active', tier: 'pro', cancelAtPeriodEnd: false }];
            if (table === db_1.workspaceMembers)
                return [{ workspaceId: 'w1', seats: N }];
            if (table === db_1.organizations)
                return [{ c: 1 }];
            if (table === db_1.users)
                return [{ c: 2 }];
            return [];
        });
        const m = await new ops_service_1.OpsService(db).getMetrics();
        strict_1.default.equal(m.mrrUsd, 12 * N); // 36
        strict_1.default.equal(m.arrUsd, 12 * N * 12); // 432
        strict_1.default.equal(m.activeSubscriptions, 1);
        strict_1.default.equal(m.canceledSubscriptions, 0);
        strict_1.default.equal(m.arpaUsd, 12 * N); // mrr / 1 active sub
        strict_1.default.equal(m.billingConfigured, true);
        strict_1.default.deepEqual(m.subscriptionsByTier, { pro: 1 });
        strict_1.default.deepEqual(m.subscriptionsByStatus, { active: 1 });
        strict_1.default.equal(m.totalActiveUsers, 2);
    });
    (0, node_test_1.it)('LTV caps at ARPA × 36 when churn is zero', async () => {
        const N = 3;
        const db = makeDb((table) => {
            if (table === db_1.subscriptions)
                return [{ workspaceId: 'w1', status: 'active', tier: 'pro', cancelAtPeriodEnd: false }];
            if (table === db_1.workspaceMembers)
                return [{ workspaceId: 'w1', seats: N }];
            if (table === db_1.organizations)
                return [{ c: 1 }];
            return [];
        });
        const m = await new ops_service_1.OpsService(db).getMetrics();
        strict_1.default.equal(m.churnRatePct, 0);
        strict_1.default.equal(m.ltvUsd, 12 * N * 36); // ARPA(36) × 36 = 1296
    });
    (0, node_test_1.it)('LTV = ARPA / churn-fraction when there is churn', async () => {
        // 1 active pro sub (5 seats → MRR 60, ARPA 60) + 1 canceled sub →
        // churn = 1/2 = 50% → LTV = 60 / 0.5 = 120.
        const db = makeDb((table) => {
            if (table === db_1.subscriptions)
                return [
                    { workspaceId: 'w1', status: 'active', tier: 'pro', cancelAtPeriodEnd: false },
                    { workspaceId: 'w2', status: 'canceled', tier: 'pro', cancelAtPeriodEnd: false },
                ];
            if (table === db_1.workspaceMembers)
                return [{ workspaceId: 'w1', seats: 5 }];
            if (table === db_1.organizations)
                return [{ c: 2 }];
            return [];
        });
        const m = await new ops_service_1.OpsService(db).getMetrics();
        strict_1.default.equal(m.mrrUsd, 60);
        strict_1.default.equal(m.arpaUsd, 60);
        strict_1.default.equal(m.churnRatePct, 50);
        strict_1.default.equal(m.canceledSubscriptions, 1);
        strict_1.default.equal(m.ltvUsd, 120);
    });
    (0, node_test_1.it)('churn rate guards divide-by-zero (0 subs → 0, not NaN)', async () => {
        const db = makeDb(() => []); // every table empty
        const m = await new ops_service_1.OpsService(db).getMetrics();
        strict_1.default.equal(m.churnRatePct, 0);
        strict_1.default.ok(Number.isFinite(m.churnRatePct));
        strict_1.default.equal(m.arpaUsd, 0);
        strict_1.default.equal(m.ltvUsd, 0);
    });
    (0, node_test_1.it)('empty DB degrades to all-zeros without throwing', async () => {
        const db = makeDb(() => []);
        const m = await new ops_service_1.OpsService(db).getMetrics();
        strict_1.default.equal(m.billingConfigured, false);
        strict_1.default.equal(m.totalOrganizations, 0);
        strict_1.default.equal(m.totalActiveUsers, 0);
        strict_1.default.equal(m.totalStorageBytes, 0);
        strict_1.default.equal(m.totalAiCostUsd, 0);
        strict_1.default.equal(m.mrrUsd, 0);
        strict_1.default.equal(m.arrUsd, 0);
        strict_1.default.equal(m.arpaUsd, 0);
        strict_1.default.equal(m.ltvUsd, 0);
        strict_1.default.equal(m.churnRatePct, 0);
        strict_1.default.equal(m.activeSubscriptions, 0);
        strict_1.default.equal(m.canceledSubscriptions, 0);
        strict_1.default.deepEqual(m.subscriptionsByTier, {});
        strict_1.default.deepEqual(m.subscriptionsByStatus, {});
        strict_1.default.equal(typeof m.generatedAt, 'string');
    });
    (0, node_test_1.it)('AI cost sums per-org token counts via the shared cost model', async () => {
        // haiku pricing: in $1/M, out $5/M → 1M in + 1M out = $1 + $5 = $6.
        const db = makeDb((table) => {
            if (table === db_1.aiUsage)
                return [{ organizationId: 'o1', model: 'claude-haiku-4-5', inTok: 1_000_000, outTok: 1_000_000 }];
            return [];
        });
        const m = await new ops_service_1.OpsService(db).getMetrics();
        strict_1.default.equal(m.totalAiCostUsd, 6);
    });
    (0, node_test_1.it)('sums storage across task + chat attachments', async () => {
        const db = makeDb((table) => {
            if (table === db_1.taskAttachments)
                return [{ organizationId: 'o1', bytes: 1000 }];
            if (table === db_1.chatMessageAttachments)
                return [{ organizationId: 'o1', bytes: 500 }];
            return [];
        });
        const m = await new ops_service_1.OpsService(db).getMetrics();
        strict_1.default.equal(m.totalStorageBytes, 1500);
    });
});
(0, node_test_1.describe)('OpsService.getOrganizations — per-org rows', () => {
    (0, node_test_1.it)('maps plan/status from the active sub and flags churn risk', async () => {
        const db = makeDb((table) => {
            if (table === db_1.organizations)
                return [{ id: 'o1', name: 'Acme', slug: 'acme', createdAt: new Date('2026-01-01') }];
            if (table === db_1.subscriptions)
                return [{ workspaceId: 'w1', status: 'active', tier: 'business', cancelAtPeriodEnd: true }];
            if (table === db_1.workspaces)
                return [{ id: 'w1', organizationId: 'o1' }];
            if (table === db_1.workspaceMembers)
                return [{ workspaceId: 'w1', seats: 4 }];
            if (table === db_1.organizationMembers)
                return [{ organizationId: 'o1', total: 4, active: 2 }];
            if (table === db_1.taskAttachments)
                return [{ organizationId: 'o1', bytes: 2048 }];
            return [];
        });
        const rows = await new ops_service_1.OpsService(db).getOrganizations();
        strict_1.default.equal(rows.length, 1);
        const r = rows[0];
        strict_1.default.equal(r.plan, 'business');
        strict_1.default.equal(r.subscriptionStatus, 'active');
        strict_1.default.equal(r.mrrUsd, 24 * 4); // business $24 × 4 seats = 96
        strict_1.default.equal(r.churnRisk, true); // cancelAtPeriodEnd
        strict_1.default.equal(r.activeUsers, 2);
        strict_1.default.equal(r.totalUsers, 4);
        strict_1.default.equal(r.storageBytes, 2048);
    });
    (0, node_test_1.it)('returns plan=null / status=null when the org has no active subscription', async () => {
        const db = makeDb((table) => {
            if (table === db_1.organizations)
                return [{ id: 'o1', name: 'Acme', slug: 'acme', createdAt: new Date('2026-01-01') }];
            if (table === db_1.subscriptions)
                return [{ workspaceId: 'w1', status: 'canceled', tier: 'pro', cancelAtPeriodEnd: false }];
            if (table === db_1.workspaces)
                return [{ id: 'w1', organizationId: 'o1' }];
            return [];
        });
        const rows = await new ops_service_1.OpsService(db).getOrganizations();
        strict_1.default.equal(rows[0].plan, null);
        strict_1.default.equal(rows[0].subscriptionStatus, null);
        strict_1.default.equal(rows[0].mrrUsd, 0);
        strict_1.default.equal(rows[0].churnRisk, true); // canceled status is a churn signal
    });
    (0, node_test_1.it)('empty DB returns an empty array without throwing', async () => {
        const rows = await new ops_service_1.OpsService(makeDb(() => [])).getOrganizations();
        strict_1.default.deepEqual(rows, []);
    });
});
//# sourceMappingURL=ops.service.test.js.map