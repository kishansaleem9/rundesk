import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { lt } from 'drizzle-orm'
import { rateLimitCounters } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../database/database.module'

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
@Injectable()
export class RateLimitCleanupService {
  private readonly logger = new Logger(RateLimitCleanupService.name)

  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  /** Delete every counter row whose window has already ended. */
  @Cron(CronExpression.EVERY_HOUR)
  async sweepExpired(): Promise<void> {
    try {
      await this.db.delete(rateLimitCounters).where(lt(rateLimitCounters.expiresAt, new Date()))
    } catch (err) {
      this.logger.error('Rate-limit counter sweep failed', err as Error)
    }
  }
}
