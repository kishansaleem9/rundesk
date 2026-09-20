import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { EmailService } from '../email/email.service';
/**
 * Sends periodic (daily/weekly) digests of unread notifications to users who
 * opted in via their notification preferences. Runs hourly and only emails the
 * users whose configured send-hour matches the current hour (weekly digests
 * additionally gated to Mondays).
 */
export declare class NotificationDigestService {
    private notifications;
    private email;
    private readonly logger;
    private readonly appUrl;
    constructor(notifications: NotificationsService, email: EmailService, config: ConfigService);
    runHourly(): Promise<{
        candidates: number;
        sent: number;
    }>;
    /**
     * Dispatch digests due at `hour`. Extracted from the cron so it can be
     * driven deterministically in tests.
     */
    dispatch(now: Date, hour: number, isWeeklyDay: boolean): Promise<{
        candidates: number;
        sent: number;
    }>;
}
