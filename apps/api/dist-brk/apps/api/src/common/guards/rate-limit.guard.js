"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitGuard = exports.RateLimit = exports.RATE_LIMIT_KEY = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../database/database.module");
exports.RATE_LIMIT_KEY = 'rate_limit_options';
/** Decorator: attach a per-route rate-limit policy read by {@link RateLimitGuard}. */
const RateLimit = (options) => (0, common_1.SetMetadata)(exports.RATE_LIMIT_KEY, options);
exports.RateLimit = RateLimit;
// Fallback (in-memory) housekeeping: stale keys are swept no more often than
// this, and any key untouched for longer than the retention horizon is dropped,
// bounding memory under spraying while the shared store is unavailable.
const SWEEP_INTERVAL_MS = 60_000;
const RETENTION_MS = 10 * 60_000;
let RateLimitGuard = class RateLimitGuard {
    constructor(reflector, db) {
        this.reflector = reflector;
        this.db = db;
        /**
         * FALLBACK-ONLY state: key → ascending list of request timestamps (ms epoch)
         * still within a window. Used only when the shared store is unreachable.
         */
        this.hits = new Map();
        this.lastSweep = Date.now();
    }
    async canActivate(context) {
        // Only HTTP requests carry the IP/route data this guard relies on.
        if (context.getType() !== 'http')
            return true;
        const options = this.reflector.getAllAndOverride(exports.RATE_LIMIT_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        // No policy on this route → not throttled.
        if (!options)
            return true;
        const req = context.switchToHttp().getRequest();
        const now = Date.now();
        const routeKey = this.routeKey(context, req);
        const clientIp = this.clientIp(req);
        // Preferred path: the SHARED Postgres fixed-window counter, which enforces
        // ONE global limit across every replica. Any store failure downgrades to
        // the local sliding-window limiter below — the request is never crashed by
        // the limiter, and an intentional 429 is thrown OUTSIDE this try/catch so it
        // can never be mistaken for a store error and swallowed.
        let sharedCount = null;
        try {
            sharedCount = await this.incrementShared(routeKey, clientIp, options, now);
        }
        catch {
            sharedCount = null;
        }
        if (sharedCount === null) {
            // DB blip → degrade to per-instance in-memory limiting (pre-hardening
            // behaviour). Better than failing open or hard-blocking auth.
            return this.allowByLocalWindow(context, options, now, routeKey, clientIp);
        }
        if (sharedCount > options.limit) {
            this.reject(context, this.windowRetryAfterSec(options, now));
        }
        return true;
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
    async incrementShared(routeKey, clientIp, options, now) {
        const windowIndex = Math.floor(now / options.windowMs);
        const bucket = `${routeKey}:${clientIp}:${windowIndex}`;
        // End of the current window (exclusive upper bound), used for expiry.
        const expiresAt = new Date((windowIndex + 1) * options.windowMs);
        const [row] = await this.db
            .insert(db_1.rateLimitCounters)
            .values({ bucket, count: 1, expiresAt })
            .onConflictDoUpdate({
            target: db_1.rateLimitCounters.bucket,
            set: { count: (0, drizzle_orm_1.sql) `${db_1.rateLimitCounters.count} + 1` },
        })
            .returning({ count: db_1.rateLimitCounters.count });
        return row?.count ?? 1;
    }
    /**
     * FALLBACK ONLY: process-local sliding-window limiter used when the shared
     * store is unreachable. State is per-instance, so limits degrade to
     * per-replica during a DB outage — acceptable and still protective.
     */
    allowByLocalWindow(context, options, now, routeKey, clientIp) {
        this.maybeSweep(now);
        const key = `${routeKey}:${clientIp}`;
        const windowStart = now - options.windowMs;
        // Prune timestamps that have aged out of the sliding window.
        const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
        if (recent.length >= options.limit) {
            // Oldest in-window hit determines when the window frees up again.
            const retryAfterSec = Math.max(1, Math.ceil((recent[0] + options.windowMs - now) / 1000));
            this.hits.set(key, recent);
            this.reject(context, retryAfterSec);
        }
        recent.push(now);
        this.hits.set(key, recent);
        return true;
    }
    /** Set the `Retry-After` header and throw the standard 429. */
    reject(context, retryAfterSec) {
        const res = context.switchToHttp().getResponse();
        // Fastify reply exposes `.header()`; set Retry-After so clients back off.
        if (res && typeof res.header === 'function')
            res.header('Retry-After', String(retryAfterSec));
        throw new common_1.HttpException({
            error: 'rate_limited',
            message: 'Too many requests. Please slow down and try again later.',
            retryAfter: retryAfterSec,
        }, common_1.HttpStatus.TOO_MANY_REQUESTS);
    }
    /** Seconds until the current fixed window ends (Retry-After for the shared path). */
    windowRetryAfterSec(options, now) {
        const windowEnd = (Math.floor(now / options.windowMs) + 1) * options.windowMs;
        return Math.max(1, Math.ceil((windowEnd - now) / 1000));
    }
    /** Route identity: controller.handler + HTTP method (IP is appended separately). */
    routeKey(context, req) {
        const r = req;
        const cls = context.getClass()?.name ?? 'Controller';
        const handler = context.getHandler()?.name ?? 'handler';
        const method = (r?.method ?? 'GET').toUpperCase();
        return `${cls}.${handler}:${method}`;
    }
    /**
     * Client IP. Fastify's `req.ip` already honours the app's `trustProxy`
     * setting (real client IP behind a reverse proxy, socket peer otherwise), so
     * we trust it and fall back to the raw socket address / a constant.
     */
    clientIp(req) {
        const r = req;
        return r?.ip ?? r?.socket?.remoteAddress ?? 'unknown';
    }
    /**
     * Drop keys that have gone quiet, so the FALLBACK map can't grow unbounded.
     * (The shared store is pruned separately by the hourly cleanup cron.)
     */
    maybeSweep(now) {
        if (now - this.lastSweep < SWEEP_INTERVAL_MS)
            return;
        const cutoff = now - RETENTION_MS;
        for (const [key, timestamps] of this.hits) {
            if (timestamps.length === 0 || timestamps[timestamps.length - 1] < cutoff) {
                this.hits.delete(key);
            }
        }
        this.lastSweep = now;
    }
};
exports.RateLimitGuard = RateLimitGuard;
exports.RateLimitGuard = RateLimitGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [core_1.Reflector, Object])
], RateLimitGuard);
//# sourceMappingURL=rate-limit.guard.js.map