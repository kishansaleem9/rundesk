"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const common_1 = require("@nestjs/common");
const rate_limit_guard_1 = require("./rate-limit.guard");
const rate_limit_cleanup_service_1 = require("./rate-limit-cleanup.service");
function reflector(options) {
    return { getAllAndOverride: () => options };
}
/**
 * Fake of the shared Postgres fixed-window store: implements the exact
 * `insert().values().onConflictDoUpdate().returning()` chain the guard calls,
 * backed by an in-memory Map keyed by bucket. `rows` is exposed so tests can
 * assert the upsert-increment actually recorded hits.
 */
function fakeStore() {
    const rows = new Map();
    const db = {
        insert() {
            let vals;
            const chain = {
                values(v) {
                    vals = v;
                    return chain;
                },
                onConflictDoUpdate() {
                    return chain;
                },
                async returning() {
                    const existing = rows.get(vals.bucket);
                    const count = existing ? existing.count + 1 : vals.count;
                    rows.set(vals.bucket, { count, expiresAt: vals.expiresAt });
                    return [{ count }];
                },
            };
            return chain;
        },
    };
    return { db: db, rows };
}
/** A DB whose upsert always throws — forces the in-memory fallback path. */
function throwingStore() {
    const chain = {
        values: () => chain,
        onConflictDoUpdate: () => chain,
        returning: async () => {
            throw new Error('db down');
        },
    };
    return { insert: () => chain };
}
function makeCtx(req, res, handlerName = 'login', className = 'AuthController') {
    function handler() { }
    Object.defineProperty(handler, 'name', { value: handlerName });
    return {
        getType: () => 'http',
        getHandler: () => handler,
        getClass: () => ({ name: className }),
        switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    };
}
const noopRes = () => ({ header: node_test_1.mock.fn() });
(0, node_test_1.describe)('RateLimitGuard', () => {
    (0, node_test_1.it)('is a no-op for routes without @RateLimit metadata', async () => {
        const guard = new rate_limit_guard_1.RateLimitGuard(reflector(undefined), fakeStore().db);
        const ctx = makeCtx({ ip: '1.2.3.4', method: 'POST' }, noopRes());
        for (let i = 0; i < 100; i++)
            strict_1.default.equal(await guard.canActivate(ctx), true);
    });
    (0, node_test_1.it)('allows requests up to the limit, then returns 429 with Retry-After', async () => {
        const guard = new rate_limit_guard_1.RateLimitGuard(reflector({ limit: 3, windowMs: 60_000 }), fakeStore().db);
        const res = noopRes();
        const ctx = makeCtx({ ip: '9.9.9.9', method: 'POST' }, res);
        strict_1.default.equal(await guard.canActivate(ctx), true);
        strict_1.default.equal(await guard.canActivate(ctx), true);
        strict_1.default.equal(await guard.canActivate(ctx), true);
        await strict_1.default.rejects(() => guard.canActivate(ctx), (err) => {
            strict_1.default.ok(err instanceof common_1.HttpException);
            strict_1.default.equal(err.getStatus(), 429);
            const body = err.getResponse();
            strict_1.default.equal(body.error, 'rate_limited');
            strict_1.default.ok(body.retryAfter >= 1);
            return true;
        });
        // Retry-After header must be set on the response.
        strict_1.default.ok(res.header.mock.callCount() >= 1);
        strict_1.default.equal(res.header.mock.calls[0].arguments[0], 'Retry-After');
    });
    (0, node_test_1.it)('shared-store path: upsert-increments the counter and 429s once the count exceeds the limit', async () => {
        const { db, rows } = fakeStore();
        const guard = new rate_limit_guard_1.RateLimitGuard(reflector({ limit: 2, windowMs: 60_000 }), db);
        const ctx = makeCtx({ ip: '5.5.5.5', method: 'POST' }, noopRes());
        strict_1.default.equal(await guard.canActivate(ctx), true); // count 1
        strict_1.default.equal(await guard.canActivate(ctx), true); // count 2
        await strict_1.default.rejects(() => guard.canActivate(ctx), // count 3 > limit 2
        (err) => err instanceof common_1.HttpException && err.getStatus() === 429);
        // All three hits landed in a SINGLE fixed-window bucket that incremented 1→3,
        // keyed by route + ip + window index.
        const entries = [...rows.entries()];
        strict_1.default.equal(entries.length, 1);
        strict_1.default.match(entries[0][0], /^AuthController\.login:POST:5\.5\.5\.5:\d+$/);
        strict_1.default.equal(entries[0][1].count, 3);
    });
    (0, node_test_1.it)('falls back to the in-memory limiter when the shared store throws (never crashes the request)', async () => {
        const guard = new rate_limit_guard_1.RateLimitGuard(reflector({ limit: 2, windowMs: 60_000 }), throwingStore());
        const ctx = makeCtx({ ip: '7.7.7.7', method: 'POST' }, noopRes());
        // Store is down, but the request is still served — and the limit is still
        // enforced locally rather than failing open.
        strict_1.default.equal(await guard.canActivate(ctx), true);
        strict_1.default.equal(await guard.canActivate(ctx), true);
        await strict_1.default.rejects(() => guard.canActivate(ctx), (err) => err instanceof common_1.HttpException && err.getStatus() === 429);
    });
    (0, node_test_1.it)('keys buckets per client IP (one IP hitting the limit does not affect another)', async () => {
        const guard = new rate_limit_guard_1.RateLimitGuard(reflector({ limit: 1, windowMs: 60_000 }), fakeStore().db);
        strict_1.default.equal(await guard.canActivate(makeCtx({ ip: 'a', method: 'POST' }, noopRes())), true);
        await strict_1.default.rejects(() => guard.canActivate(makeCtx({ ip: 'a', method: 'POST' }, noopRes())));
        // Different IP has its own independent window.
        strict_1.default.equal(await guard.canActivate(makeCtx({ ip: 'b', method: 'POST' }, noopRes())), true);
    });
    (0, node_test_1.it)('keys buckets per route (same IP on a different handler is independent)', async () => {
        const guard = new rate_limit_guard_1.RateLimitGuard(reflector({ limit: 1, windowMs: 60_000 }), fakeStore().db);
        strict_1.default.equal(await guard.canActivate(makeCtx({ ip: 'a', method: 'POST' }, noopRes(), 'login')), true);
        await strict_1.default.rejects(() => guard.canActivate(makeCtx({ ip: 'a', method: 'POST' }, noopRes(), 'login')));
        strict_1.default.equal(await guard.canActivate(makeCtx({ ip: 'a', method: 'POST' }, noopRes(), 'signup')), true);
    });
    (0, node_test_1.it)('rolls the fixed window forward as time passes', async () => {
        node_test_1.mock.timers.enable({ apis: ['Date'] });
        try {
            const guard = new rate_limit_guard_1.RateLimitGuard(reflector({ limit: 2, windowMs: 1000 }), fakeStore().db);
            const ctx = makeCtx({ ip: 'z', method: 'POST' }, noopRes());
            strict_1.default.equal(await guard.canActivate(ctx), true);
            strict_1.default.equal(await guard.canActivate(ctx), true);
            await strict_1.default.rejects(() => guard.canActivate(ctx)); // 3rd within the window → blocked
            node_test_1.mock.timers.tick(1500); // advance into the next fixed window
            strict_1.default.equal(await guard.canActivate(ctx), true); // fresh window → allowed again
        }
        finally {
            node_test_1.mock.timers.reset();
        }
    });
    (0, node_test_1.it)('exports a stable metadata key for the @RateLimit decorator', () => {
        strict_1.default.equal(typeof rate_limit_guard_1.RATE_LIMIT_KEY, 'string');
    });
});
(0, node_test_1.describe)('RateLimitCleanupService', () => {
    (0, node_test_1.it)('deletes counter rows whose window has expired', async () => {
        let deleted = false;
        let predicate;
        const db = {
            delete: () => ({
                where: async (p) => {
                    deleted = true;
                    predicate = p;
                    return [];
                },
            }),
        };
        await new rate_limit_cleanup_service_1.RateLimitCleanupService(db).sweepExpired();
        strict_1.default.equal(deleted, true);
        // An `expires_at < now` condition was handed to the delete.
        strict_1.default.ok(predicate);
    });
    (0, node_test_1.it)('never throws even if the delete fails', async () => {
        const db = {
            delete: () => ({
                where: async () => {
                    throw new Error('db down');
                },
            }),
        };
        await strict_1.default.doesNotReject(() => new rate_limit_cleanup_service_1.RateLimitCleanupService(db).sweepExpired());
    });
});
//# sourceMappingURL=rate-limit.guard.test.js.map