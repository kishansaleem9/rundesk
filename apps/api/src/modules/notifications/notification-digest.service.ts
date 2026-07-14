import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { ConfigService } from '@nestjs/config'
import { NotificationsService } from './notifications.service'
import { EmailService } from '../email/email.service'

/**
 * Sends periodic (daily/weekly) digests of unread notifications to users who
 * opted in via their notification preferences. Runs hourly and only emails the
 * users whose configured send-hour matches the current hour (weekly digests
 * additionally gated to Mondays).
 */
@Injectable()
export class NotificationDigestService {
  private readonly logger = new Logger(NotificationDigestService.name)
  private readonly appUrl: string

  constructor(
    private notifications: NotificationsService,
    private email: EmailService,
    config: ConfigService,
  ) {
    this.appUrl = config.get<string>('APP_URL') ?? 'http://localhost:5173'
  }

  @Cron(CronExpression.EVERY_HOUR)
  async runHourly() {
    const now = new Date()
    return this.dispatch(now, now.getUTCHours(), now.getUTCDay() === 1)
  }

  /**
   * Dispatch digests due at `hour`. Extracted from the cron so it can be
   * driven deterministically in tests.
   */
  async dispatch(now: Date, hour: number, isWeeklyDay: boolean) {
    const recipients = await this.notifications.listDigestRecipients()
    let sent = 0
    for (const r of recipients) {
      if (r.hour !== hour) continue
      if (r.frequency === 'weekly' && !isWeeklyDay) continue
      const digest = await this.notifications.buildDigest(r.userId, r.frequency, now)
      if (digest.total === 0) continue
      try {
        await this.email.sendDigest({
          to: r.email,
          recipientName: r.displayName ?? r.email,
          frequency: r.frequency,
          total: digest.total,
          groups: digest.groups,
          appUrl: this.appUrl,
        })
        sent += 1
      } catch (err) {
        this.logger.error(`Digest send failed for ${r.userId}: ${(err as Error).message}`)
      }
    }
    if (sent > 0) this.logger.log(`Sent ${sent} notification digest(s) for hour ${hour}`)
    return { candidates: recipients.length, sent }
  }
}
