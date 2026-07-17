import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { sql } from 'drizzle-orm'
import { rateLimitCounters } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../database/database.module'

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
  limit: number
  /** Window length in milliseconds. */
  windowMs: number
}

export const RATE_LIMIT_KEY = 'rate_limit_options'

/** Decorator: attach a per-route rate-limit policy read by {@link RateLimitGuard}. */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options)

// Fallback (in-memory) housekeeping: stale keys are swept no more often than
// this, and any key untouched for longer than the retention horizon is dropped,
// bounding memory under spraying while the shared store is unavailable.
const SWEEP_INTERVAL_MS = 60_000
const RETENTION_MS = 10 * 60_000

@Injectable()
export class RateLimitGuard implements CanActivate {
  /**
   * FALLBACK-ONLY state: key → ascending list of request timestamps (ms epoch)
   * still within a window. Used only when the shared store is unreachable.
   */
  private readonly hits = new Map<string, number[]>()
  private lastSweep = Date.now()

  constructor(
    private readonly reflector: Reflector,
    @Inject(DB_TOKEN) private readonly db: Db,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Only HTTP requests carry the IP/route data this guard relies on.
    if (context.getType() !== 'http') return true

    const options = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    // No policy on this route → not throttled.
    if (!options) return true

    const req = context.switchToHttp().getRequest()
    const now = Date.now()
    const routeKey = this.routeKey(context, req)
    const clientIp = this.clientIp(req)

    // Preferred path: the SHARED Postgres fixed-window counter, which enforces
    // ONE global limit across every replica. Any store failure downgrades to
    // the local sliding-window limiter below — the request is never crashed by
    // the limiter, and an intentional 429 is thrown OUTSIDE this try/catch so it
    // can never be mistaken for a store error and swallowed.
    let sharedCount: number | null = null
    try {
      sharedCount = await this.incrementShared(routeKey, clientIp, options, now)
    } catch {
      sharedCount = null
    }

    if (sharedCount === null) {
      // DB blip → degrade to per-instance in-memory limiting (pre-hardening
      // behaviour). Better than failing open or hard-blocking auth.
      return this.allowByLocalWindow(context, options, now, routeKey, clientIp)
    }

    if (sharedCount > options.limit) {
      this.reject(context, this.windowRetryAfterSec(options, now))
    }
    return true
  }

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
  private async incrementShared(
    routeKey: string,
    clientIp: string,
    options: RateLimitOptions,
    now: number,
  ): Promise<number> {
    const windowIndex = Math.floor(now / options.windowMs)
    const bucket = `${routeKey}:${clientIp}:${windowIndex}`
    // End of the current window (exclusive upper bound), used for expiry.
    const expiresAt = new Date((windowIndex + 1) * options.windowMs)

    const [row] = await this.db
      .insert(rateLimitCounters)
      .values({ bucket, count: 1, expiresAt })
      .onConflictDoUpdate({
        target: rateLimitCounters.bucket,
        set: { count: sql`${rateLimitCounters.count} + 1` },
      })
      .returning({ count: rateLimitCounters.count })

    return row?.count ?? 1
  }

  /**
   * FALLBACK ONLY: process-local sliding-window limiter used when the shared
   * store is unreachable. State is per-instance, so limits degrade to
   * per-replica during a DB outage — acceptable and still protective.
   */
  private allowByLocalWindow(
    context: ExecutionContext,
    options: RateLimitOptions,
    now: number,
    routeKey: string,
    clientIp: string,
  ): boolean {
    this.maybeSweep(now)

    const key = `${routeKey}:${clientIp}`
    const windowStart = now - options.windowMs
    // Prune timestamps that have aged out of the sliding window.
    const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart)

    if (recent.length >= options.limit) {
      // Oldest in-window hit determines when the window frees up again.
      const retryAfterSec = Math.max(1, Math.ceil((recent[0] + options.windowMs - now) / 1000))
      this.hits.set(key, recent)
      this.reject(context, retryAfterSec)
    }

    recent.push(now)
    this.hits.set(key, recent)
    return true
  }

  /** Set the `Retry-After` header and throw the standard 429. */
  private reject(context: ExecutionContext, retryAfterSec: number): never {
    const res = context.switchToHttp().getResponse()
    // Fastify reply exposes `.header()`; set Retry-After so clients back off.
    if (res && typeof res.header === 'function') res.header('Retry-After', String(retryAfterSec))
    throw new HttpException(
      {
        error: 'rate_limited',
        message: 'Too many requests. Please slow down and try again later.',
        retryAfter: retryAfterSec,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    )
  }

  /** Seconds until the current fixed window ends (Retry-After for the shared path). */
  private windowRetryAfterSec(options: RateLimitOptions, now: number): number {
    const windowEnd = (Math.floor(now / options.windowMs) + 1) * options.windowMs
    return Math.max(1, Math.ceil((windowEnd - now) / 1000))
  }

  /** Route identity: controller.handler + HTTP method (IP is appended separately). */
  private routeKey(context: ExecutionContext, req: unknown): string {
    const r = req as { method?: string } | undefined
    const cls = context.getClass()?.name ?? 'Controller'
    const handler = context.getHandler()?.name ?? 'handler'
    const method = (r?.method ?? 'GET').toUpperCase()
    return `${cls}.${handler}:${method}`
  }

  /**
   * Client IP. Fastify's `req.ip` already honours the app's `trustProxy`
   * setting (real client IP behind a reverse proxy, socket peer otherwise), so
   * we trust it and fall back to the raw socket address / a constant.
   */
  private clientIp(req: unknown): string {
    const r = req as { ip?: string; socket?: { remoteAddress?: string } } | undefined
    return r?.ip ?? r?.socket?.remoteAddress ?? 'unknown'
  }

  /**
   * Drop keys that have gone quiet, so the FALLBACK map can't grow unbounded.
   * (The shared store is pruned separately by the hourly cleanup cron.)
   */
  private maybeSweep(now: number): void {
    if (now - this.lastSweep < SWEEP_INTERVAL_MS) return
    const cutoff = now - RETENTION_MS
    for (const [key, timestamps] of this.hits) {
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] < cutoff) {
        this.hits.delete(key)
      }
    }
    this.lastSweep = now
  }
}
