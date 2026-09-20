import { ConfigService } from '@nestjs/config';
import type { Db } from '@rundesk/db';
import { ReportsService } from './reports.service';
import { EmailService } from '../email/email.service';
/** Shape the due-selection predicate needs — a subset of a custom_reports row. */
export type SchedulableReport = {
    scheduleFrequency: 'none' | 'daily' | 'weekly' | string;
    scheduleHour: number;
    scheduleDayOfWeek: number | null;
    lastSentAt: Date | string | null;
};
/**
 * Decide whether a scheduled report is due to be emailed at `now` (UTC):
 *  - frequency must be daily or weekly;
 *  - the current UTC hour must equal the configured send hour;
 *  - weekly reports additionally require the current UTC weekday to match
 *    (a weekly report with no weekday set defaults to Monday, matching the UI);
 *  - last_sent_at gates re-sends: a report already sent earlier the same UTC
 *    day is skipped. Because the weekday+hour match already limits a weekly
 *    report to one firing window per week, the same-day guard is all that's
 *    needed to prevent a duplicate send within that window (e.g. a process
 *    restart re-running the hourly cron, or a preceding "send now").
 *
 * Pure + UTC-based so the hourly cron and the unit tests agree exactly.
 */
export declare function isReportDueNow(report: SchedulableReport, now: Date): boolean;
/**
 * §9.5 — hourly runner that emails saved custom reports on their configured
 * daily/weekly cadence. Mirrors NotificationDigestService: the cron delegates to
 * a `dispatch(now)` that can be driven deterministically in tests, and each
 * report is delivered best-effort so one failure never blocks the rest.
 */
export declare class ScheduledReportsService {
    private db;
    private reports;
    private email;
    private readonly logger;
    private readonly appUrl;
    constructor(db: Db, reports: ReportsService, email: EmailService, config: ConfigService);
    runHourly(): Promise<{
        candidates: number;
        due: number;
        sent: number;
    }>;
    /**
     * Find every scheduled report, keep the ones due at `now`, and deliver each.
     * Returns counts so callers/tests can assert selection without live SMTP.
     */
    dispatch(now?: Date): Promise<{
        candidates: number;
        due: number;
        sent: number;
    }>;
    /**
     * §9.5 one-off trigger (POST /reports/custom/:id/send-now). Sends the report
     * immediately regardless of its cadence, then stamps last_sent_at so the cron
     * won't duplicate it the same day. Workspace-scoped.
     */
    sendReportNow(workspaceId: string, reportId: string): Promise<{
        ok: boolean;
        recipients: string[];
    }>;
    /** Load scheduled reports (optionally a specific one) joined with the owner email. */
    private loadScheduledReports;
    /**
     * Run the report, render it (CSV attachment + compact HTML table), email each
     * recipient, and stamp last_sent_at. Recipients default to the report owner
     * when the schedule list is empty. Returns the resolved recipient list.
     */
    private deliver;
    /** Recipients from the schedule list, or the owner email as the default. */
    private resolveRecipients;
    private stamp;
}
