import type { Db } from '@rundesk/db';
/**
 * Hourly sweep of the shared rate-limit counter table backing
 * {@link ../guards/rate-limit.guard RateLimitGuard}. Fixed-window rows in
 * `rate_limit_counters` are only meaningful until their window ends; without a
 * sweep the table would accumulate one dead row per `(route, ip, window)`
 * forever. Deleting rows whose `expires_at` has passed keeps it bounded (the
 * `rate_limit_counters_expires_idx` index makes the delete cheap).
 *
 * Best-effort: a failed sweep is logged and retried on the next tick — it must
 * never throw into the scheduler, and a missed sweep only delays cleanup.
 */
export declare class RateLimitCleanupService {
    private readonly db;
    private readonly logger;
    constructor(db: Db);
    /** Delete every counter row whose window has already ended. */
    sweepExpired(): Promise<void>;
}
