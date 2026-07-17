import { pgTable, text, integer, timestamp, index } from 'drizzle-orm/pg-core'

/**
 * Shared fixed-window rate-limit counters (hardening §rate-limit). Backs the
 * multi-instance rate limiter: every API replica increments the same
 * `(key, window)` bucket here, so a horizontally-scaled deployment enforces ONE
 * global limit instead of per-replica limits. `bucket` is `"<routeKey>:<ip>:<windowStart>"`;
 * `expiresAt` lets a periodic sweep prune old rows. Auth endpoints are low-volume
 * so the per-request upsert cost is negligible.
 */
export const rateLimitCounters = pgTable(
  'rate_limit_counters',
  {
    bucket:    text('bucket').primaryKey(),
    count:     integer('count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => ({
    byExpires: index('rate_limit_counters_expires_idx').on(t.expiresAt),
  }),
)
