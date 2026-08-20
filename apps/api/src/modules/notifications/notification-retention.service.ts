import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { and, isNotNull, lt, sql } from 'drizzle-orm'
import { notifications } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

/**
 * §2.5 — cleared notifications age out.
 *
 * > "after 30 DAYS baad woh saare notifications automatically VANISH ho
 * > jayenge. ClickUp ka storage system TRASH ki tarah hi hai."
 *
 * Clearing a notification is the user saying they are done with it, and until
 * now that meant it sat in the Cleared bucket for ever. Trash already works
 * this way; notifications did not.
 *
 * Deliberately narrow. Only rows the user has actually dismissed are eligible,
 * and only by when they were dismissed — not by when they were created, which
 * would delete a notification someone cleared this morning because the event it
 * describes was old. Anything still in the Inbox, or snoozed to Later, is left
 * alone however long it has been there: nobody asked for their unread mentions
 * to be deleted.
 */
@Injectable()
export class NotificationRetentionService implements OnModuleInit {
  private readonly logger = new Logger(NotificationRetentionService.name)

  /** How long a cleared notification is kept. Her number. */
  static readonly RETENTION_DAYS = 30

  constructor(@Inject(DB_TOKEN) private db: Db) {}

  /**
   * Announce the policy on boot. The job itself first runs at 4am, which is a
   * long time to wait to find out whether a deploy wired it up — this line in
   * the container log is what deploy/verify-release.sh checks.
   */
  onModuleInit() {
    this.logger.log(
      `notification retention active: cleared notifications are deleted after ${NotificationRetentionService.RETENTION_DAYS} days`,
    )
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'notification-retention' })
  async runDaily() {
    return this.purge(new Date())
  }

  /**
   * Delete cleared notifications dismissed more than RETENTION_DAYS before
   * `now`. Takes the clock as an argument so the boundary can be tested at all
   * — a job that only ever runs against "today" is a job whose off-by-one you
   * find in production.
   */
  async purge(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - NotificationRetentionService.RETENTION_DAYS * 24 * 60 * 60 * 1000)

    const deleted = await this.db
      .delete(notifications)
      .where(and(isNotNull(notifications.dismissedAt), lt(notifications.dismissedAt, cutoff)))
      .returning({ id: notifications.id })

    if (deleted.length > 0) {
      this.logger.log(
        `purged ${deleted.length} cleared notification(s) dismissed before ${cutoff.toISOString()}`,
      )
    }
    return deleted.length
  }

  /**
   * What the purge would remove, without removing it. Used by the deploy
   * verification, which needs to know the job is wired up without waiting a
   * day or destroying anything to find out.
   */
  async countDue(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - NotificationRetentionService.RETENTION_DAYS * 24 * 60 * 60 * 1000)
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(isNotNull(notifications.dismissedAt), lt(notifications.dismissedAt, cutoff)))
    return row?.count ?? 0
  }
}
