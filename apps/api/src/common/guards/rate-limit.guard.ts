import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'

/**
 * In-memory, dependency-free, per-IP sliding-window rate limiter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SCOPE / LIMITATION: state lives in a process-local Map, so limits are enforced
 * PER INSTANCE (single node). Running multiple API replicas behind a load
 * balancer would give each replica its own counters, multiplying the effective
 * limit by the replica count. A shared store (e.g. Redis with a sliding-window
 * or token-bucket script) is required to enforce a single global limit across a
 * horizontally-scaled deployment. Even so, this genuinely throttles credential
 * brute-force, password spraying and email bombing on a single-node deployment
 * today, with zero new dependencies.
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
  /** Sliding-window length in milliseconds. */
  windowMs: number
}

export const RATE_LIMIT_KEY = 'rate_limit_options'

/** Decorator: attach a per-route rate-limit policy read by {@link RateLimitGuard}. */
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, options)

// Stale keys are swept out no more often than this, and any key untouched for
// longer than the retention horizon is dropped, bounding memory under spraying.
const SWEEP_INTERVAL_MS = 60_000
const RETENTION_MS = 10 * 60_000

@Injectable()
export class RateLimitGuard implements CanActivate {
  /** key → ascending list of request timestamps (ms epoch) still within a window. */
  private readonly hits = new Map<string, number[]>()
  private lastSweep = Date.now()

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
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
    this.maybeSweep(now)

    const key = this.buildKey(context, req)
    const windowStart = now - options.windowMs
    // Prune timestamps that have aged out of the sliding window.
    const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart)

    if (recent.length >= options.limit) {
      // Oldest in-window hit determines when the window frees up again.
      const retryAfterSec = Math.max(1, Math.ceil((recent[0] + options.windowMs - now) / 1000))
      this.hits.set(key, recent)
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

    recent.push(now)
    this.hits.set(key, recent)
    return true
  }

  /** Bucket key: controller.handler + HTTP method + client IP. */
  private buildKey(context: ExecutionContext, req: unknown): string {
    const r = req as { method?: string } | undefined
    const cls = context.getClass()?.name ?? 'Controller'
    const handler = context.getHandler()?.name ?? 'handler'
    const method = (r?.method ?? 'GET').toUpperCase()
    return `${cls}.${handler}:${method}:${this.clientIp(req)}`
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

  /** Drop keys that have gone quiet, so memory can't grow unbounded. */
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
