"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitCounters = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
/**
 * Shared fixed-window rate-limit counters (hardening §rate-limit). Backs the
 * multi-instance rate limiter: every API replica increments the same
 * `(key, window)` bucket here, so a horizontally-scaled deployment enforces ONE
 * global limit instead of per-replica limits. `bucket` is `"<routeKey>:<ip>:<windowStart>"`;
 * `expiresAt` lets a periodic sweep prune old rows. Auth endpoints are low-volume
 * so the per-request upsert cost is negligible.
 */
exports.rateLimitCounters = (0, pg_core_1.pgTable)('rate_limit_counters', {
    bucket: (0, pg_core_1.text)('bucket').primaryKey(),
    count: (0, pg_core_1.integer)('count').notNull().default(0),
    expiresAt: (0, pg_core_1.timestamp)('expires_at', { withTimezone: true }).notNull(),
}, (t) => ({
    byExpires: (0, pg_core_1.index)('rate_limit_counters_expires_idx').on(t.expiresAt),
}));
//# sourceMappingURL=rate-limits.js.map