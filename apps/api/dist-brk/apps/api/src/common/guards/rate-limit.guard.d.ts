import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Db } from '@rundesk/db';
/**
 * Dependency-free, per-IP + per-route rate limiter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GLOBAL ENFORCEMENT (was: per-instance): limits are now enforced ONCE across
 * every API replica via a SHARED Postgres-backed FIXED-WINDOW counter
 * (`rate_limit_counters`). On each throttled request every replica atomically
 * upsert-increments the same `(routeKey, ip, window)` bucket and reads back the
 * running count, so N replicas behind a load balancer share a single global
 * limit instead of each getting the full budget (the old limitation, where the
 * effective limit multiplied by the replica count). Postgres IS the shared
 * store — no Redis, no new dependency.
 *
 * RESILIENCE / FALLBACK: if the shared upsert throws (DB blip, pool exhausted,
 * migration lag, …) the guard FALLS BACK to a process-local in-memory
 * sliding-window counter rather than either (a) failing open — which would drop
 * all brute-force / password-spray / email-bomb protection during a DB hiccup —
 * or (b) hard-blocking auth — which would turn a transient DB blip into a full
 * auth outage. The deliberate tradeoff while the store is unreachable is that
 * limits degrade to PER-INSTANCE (the pre-hardening behaviour), which still
 * throttles abuse on each node. The limiter must NEVER crash a request: a
 * genuine store error is swallowed and downgraded to the local path; only an
 * intentional 429 propagates.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Usage: annotate a route with `@RateLimit({ limit, windowMs })` and make sure
 * `RateLimitGuard` is in the guard chain (applied at the controller level so it
 * runs BEFORE route-level auth guards — failed password attempts must still
 * count toward the limit). Routes without the decorator are never throttled.
 */
export interface RateLimitOptions {
    /** Maximum number of requests permitted within the window, per key. */
    limit: number;
    /** Window length in milliseconds. */
    windowMs: number;
}
export declare const RATE_LIMIT_KEY = "rate_limit_options";
/** Decorator: attach a per-route rate-limit policy read by {@link RateLimitGuard}. */
export declare const RateLimit: (options: RateLimitOptions) => import("@nestjs/common").CustomDecorator<string>;
export declare class RateLimitGuard implements CanActivate {
    private readonly reflector;
    private readonly db;
    /**
     * FALLBACK-ONLY state: key → ascending list of request timestamps (ms epoch)
     * still within a window. Used only when the shared store is unreachable.
     */
    private readonly hits;
    private lastSweep;
    constructor(reflector: Reflector, db: Db);
    canActivate(context: ExecutionContext): Promise<boolean>;
    /**
     * Atomically upsert-increment the shared fixed-window counter for this
     * `(routeKey, ip, window)` and return the running count within the window.
     *
     * The window index buckets time into fixed `windowMs`-wide slots, so a single
     * atomic `INSERT … ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count`
     * both records this hit and reports the live total — no read-modify-write race
     * across replicas. `expiresAt` is the window boundary, letting a periodic
     * sweep prune the row once the window has passed.
     */
    private incrementShared;
    /**
     * FALLBACK ONLY: process-local sliding-window limiter used when the shared
     * store is unreachable. State is per-instance, so limits degrade to
     * per-replica during a DB outage — acceptable and still protective.
     */
    private allowByLocalWindow;
    /** Set the `Retry-After` header and throw the standard 429. */
    private reject;
    /** Seconds until the current fixed window ends (Retry-After for the shared path). */
    private windowRetryAfterSec;
    /** Route identity: controller.handler + HTTP method (IP is appended separately). */
    private routeKey;
    /**
     * Client IP. Fastify's `req.ip` already honours the app's `trustProxy`
     * setting (real client IP behind a reverse proxy, socket peer otherwise), so
     * we trust it and fall back to the raw socket address / a constant.
     */
    private clientIp;
    /**
     * Drop keys that have gone quiet, so the FALLBACK map can't grow unbounded.
     * (The shared store is pruned separately by the hourly cleanup cron.)
     */
    private maybeSweep;
}
