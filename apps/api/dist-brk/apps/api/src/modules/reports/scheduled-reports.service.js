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
var ScheduledReportsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScheduledReportsService = void 0;
exports.isReportDueNow = isReportDueNow;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const config_1 = require("@nestjs/config");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
const reports_service_1 = require("./reports.service");
const email_service_1 = require("../email/email.service");
/** True when the two instants fall on the same UTC calendar day. */
function sameUtcDay(a, b) {
    return (a.getUTCFullYear() === b.getUTCFullYear() &&
        a.getUTCMonth() === b.getUTCMonth() &&
        a.getUTCDate() === b.getUTCDate());
}
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
function isReportDueNow(report, now) {
    const freq = report.scheduleFrequency;
    if (freq !== 'daily' && freq !== 'weekly')
        return false;
    const hour = Math.trunc(Number(report.scheduleHour));
    if (!Number.isInteger(hour) || now.getUTCHours() !== hour)
        return false;
    if (freq === 'weekly') {
        const raw = report.scheduleDayOfWeek;
        const dow = raw === null || raw === undefined ? 1 : Math.trunc(Number(raw));
        const targetDow = Number.isInteger(dow) ? ((dow % 7) + 7) % 7 : 1;
        if (now.getUTCDay() !== targetDow)
            return false;
    }
    if (report.lastSentAt) {
        const last = new Date(report.lastSentAt);
        if (!Number.isNaN(last.getTime()) && sameUtcDay(last, now))
            return false;
    }
    return true;
}
/** Humanize a metric/dimension id ("tasks-count" → "Tasks count") for email display. */
function humanize(s) {
    return String(s || '')
        .replace(/[-_]/g, ' ')
        .replace(/^\w/, (c) => c.toUpperCase());
}
/**
 * §9.5 — hourly runner that emails saved custom reports on their configured
 * daily/weekly cadence. Mirrors NotificationDigestService: the cron delegates to
 * a `dispatch(now)` that can be driven deterministically in tests, and each
 * report is delivered best-effort so one failure never blocks the rest.
 */
let ScheduledReportsService = ScheduledReportsService_1 = class ScheduledReportsService {
    constructor(db, reports, email, config) {
        this.db = db;
        this.reports = reports;
        this.email = email;
        this.logger = new common_1.Logger(ScheduledReportsService_1.name);
        this.appUrl = config.get('APP_URL') ?? 'http://localhost:5173';
    }
    async runHourly() {
        return this.dispatch(new Date());
    }
    /**
     * Find every scheduled report, keep the ones due at `now`, and deliver each.
     * Returns counts so callers/tests can assert selection without live SMTP.
     */
    async dispatch(now = new Date()) {
        const rows = await this.loadScheduledReports();
        const due = rows.filter((r) => isReportDueNow(r, now));
        let sent = 0;
        for (const report of due) {
            try {
                await this.deliver(report, now);
                sent += 1;
            }
            catch (err) {
                this.logger.error(`Scheduled report ${report.id} failed: ${err.message}`);
            }
        }
        if (sent > 0)
            this.logger.log(`Sent ${sent} scheduled report(s) (from ${due.length} due, ${rows.length} scheduled)`);
        return { candidates: rows.length, due: due.length, sent };
    }
    /**
     * §9.5 one-off trigger (POST /reports/custom/:id/send-now). Sends the report
     * immediately regardless of its cadence, then stamps last_sent_at so the cron
     * won't duplicate it the same day. Workspace-scoped.
     */
    async sendReportNow(workspaceId, reportId) {
        const [report] = await this.loadScheduledReports((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(db_1.customReports.id, reportId), (0, drizzle_orm_1.eq)(db_1.customReports.workspaceId, workspaceId)));
        if (!report)
            throw new common_1.NotFoundException('Report not found');
        const recipients = await this.deliver(report, new Date());
        return { ok: true, recipients };
    }
    /** Load scheduled reports (optionally a specific one) joined with the owner email. */
    async loadScheduledReports(where) {
        const rows = await this.db
            .select({
            id: db_1.customReports.id,
            workspaceId: db_1.customReports.workspaceId,
            name: db_1.customReports.name,
            definition: db_1.customReports.definition,
            scheduleFrequency: db_1.customReports.scheduleFrequency,
            scheduleHour: db_1.customReports.scheduleHour,
            scheduleDayOfWeek: db_1.customReports.scheduleDayOfWeek,
            scheduleRecipients: db_1.customReports.scheduleRecipients,
            lastSentAt: db_1.customReports.lastSentAt,
            ownerEmail: db_1.users.email,
        })
            .from(db_1.customReports)
            .leftJoin(db_1.users, (0, drizzle_orm_1.eq)(db_1.users.id, db_1.customReports.createdById))
            .where(where ?? (0, drizzle_orm_1.sql) `${db_1.customReports.scheduleFrequency} <> 'none'`);
        return rows;
    }
    /**
     * Run the report, render it (CSV attachment + compact HTML table), email each
     * recipient, and stamp last_sent_at. Recipients default to the report owner
     * when the schedule list is empty. Returns the resolved recipient list.
     */
    async deliver(report, now) {
        const recipients = this.resolveRecipients(report);
        if (recipients.length === 0) {
            this.logger.warn(`Scheduled report ${report.id} has no recipients (and no owner email); skipping`);
            // Still stamp so we don't re-evaluate it every hour with no way to deliver.
            await this.stamp(report.id, now);
            return [];
        }
        const result = await this.reports.runCustomReport(report.workspaceId, report.definition ?? {});
        const csv = (0, reports_service_1.reportResultToCsv)(result);
        const columns = [humanize(result.dimension), ...result.metrics.map(humanize)];
        const tableRows = result.rows.map((r) => [r.label, ...result.metrics.map((m) => r.values[m] ?? 0)]);
        const frequency = report.scheduleFrequency === 'weekly' ? 'weekly' : 'daily';
        let delivered = 0;
        for (const to of recipients) {
            try {
                await this.email.sendScheduledReport({
                    to,
                    reportName: report.name,
                    frequency,
                    groupLabel: humanize(result.dimension),
                    columns,
                    rows: tableRows,
                    totalRows: result.rows.length,
                    generatedAt: result.generatedAt,
                    csv,
                    appUrl: this.appUrl,
                });
                delivered += 1;
            }
            catch (err) {
                this.logger.error(`Report ${report.id} email to ${to} failed: ${err.message}`);
            }
        }
        await this.stamp(report.id, now);
        this.logger.log(`Report "${report.name}" (${report.id}) sent to ${delivered}/${recipients.length} recipient(s)`);
        return recipients;
    }
    /** Recipients from the schedule list, or the owner email as the default. */
    resolveRecipients(report) {
        const list = Array.isArray(report.scheduleRecipients) ? report.scheduleRecipients : [];
        const cleaned = list.map((e) => String(e ?? '').trim().toLowerCase()).filter((e) => e.length > 0);
        if (cleaned.length > 0)
            return [...new Set(cleaned)];
        const owner = report.ownerEmail?.trim().toLowerCase();
        return owner ? [owner] : [];
    }
    async stamp(reportId, now) {
        await this.db.update(db_1.customReports).set({ lastSentAt: now }).where((0, drizzle_orm_1.eq)(db_1.customReports.id, reportId));
    }
};
exports.ScheduledReportsService = ScheduledReportsService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_HOUR),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ScheduledReportsService.prototype, "runHourly", null);
exports.ScheduledReportsService = ScheduledReportsService = ScheduledReportsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object, reports_service_1.ReportsService,
        email_service_1.EmailService,
        config_1.ConfigService])
], ScheduledReportsService);
//# sourceMappingURL=scheduled-reports.service.js.map