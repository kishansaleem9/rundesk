import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { ConfigService } from '@nestjs/config'
import { and, eq, sql } from 'drizzle-orm'
import { customReports, users, workspaceMembers } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { ReportsService, reportResultToCsv, type ReportDefinition } from './reports.service'
import { EmailService } from '../email/email.service'

/** Shape the due-selection predicate needs — a subset of a custom_reports row. */
export type SchedulableReport = {
  scheduleFrequency: 'none' | 'daily' | 'weekly' | string
  scheduleHour: number
  scheduleDayOfWeek: number | null
  lastSentAt: Date | string | null
}

/** True when the two instants fall on the same UTC calendar day. */
function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
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
export function isReportDueNow(report: SchedulableReport, now: Date): boolean {
  const freq = report.scheduleFrequency
  if (freq !== 'daily' && freq !== 'weekly') return false

  const hour = Math.trunc(Number(report.scheduleHour))
  if (!Number.isInteger(hour) || now.getUTCHours() !== hour) return false

  if (freq === 'weekly') {
    const raw = report.scheduleDayOfWeek
    const dow = raw === null || raw === undefined ? 1 : Math.trunc(Number(raw))
    const targetDow = Number.isInteger(dow) ? ((dow % 7) + 7) % 7 : 1
    if (now.getUTCDay() !== targetDow) return false
  }

  if (report.lastSentAt) {
    const last = new Date(report.lastSentAt)
    if (!Number.isNaN(last.getTime()) && sameUtcDay(last, now)) return false
  }

  return true
}

/** Humanize a metric/dimension id ("tasks-count" → "Tasks count") for email display. */
function humanize(s: string): string {
  return String(s || '')
    .replace(/[-_]/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
}

type ScheduledReportRow = {
  id: string
  workspaceId: string
  name: string
  definition: ReportDefinition
  scheduleFrequency: 'none' | 'daily' | 'weekly'
  scheduleHour: number
  scheduleDayOfWeek: number | null
  scheduleRecipients: string[]
  lastSentAt: Date | string | null
  ownerEmail: string | null
  /** Who the report is run as: its owner, whose view of the workspace it is. */
  createdById: string | null
  ownerRole: string | null
}

/**
 * §9.5 — hourly runner that emails saved custom reports on their configured
 * daily/weekly cadence. Mirrors NotificationDigestService: the cron delegates to
 * a `dispatch(now)` that can be driven deterministically in tests, and each
 * report is delivered best-effort so one failure never blocks the rest.
 */
@Injectable()
export class ScheduledReportsService {
  private readonly logger = new Logger(ScheduledReportsService.name)
  private readonly appUrl: string

  constructor(
    @Inject(DB_TOKEN) private db: Db,
    private reports: ReportsService,
    private email: EmailService,
    config: ConfigService,
  ) {
    this.appUrl = config.get<string>('APP_URL') ?? 'http://localhost:5173'
  }

  @Cron(CronExpression.EVERY_HOUR)
  async runHourly() {
    return this.dispatch(new Date())
  }

  /**
   * Find every scheduled report, keep the ones due at `now`, and deliver each.
   * Returns counts so callers/tests can assert selection without live SMTP.
   */
  async dispatch(now: Date = new Date()) {
    const rows = await this.loadScheduledReports()
    const due = rows.filter((r) => isReportDueNow(r, now))
    let sent = 0
    for (const report of due) {
      try {
        await this.deliver(report, now)
        sent += 1
      } catch (err) {
        this.logger.error(`Scheduled report ${report.id} failed: ${(err as Error).message}`)
      }
    }
    if (sent > 0) this.logger.log(`Sent ${sent} scheduled report(s) (from ${due.length} due, ${rows.length} scheduled)`)
    return { candidates: rows.length, due: due.length, sent }
  }

  /**
   * §9.5 one-off trigger (POST /reports/custom/:id/send-now). Sends the report
   * immediately regardless of its cadence, then stamps last_sent_at so the cron
   * won't duplicate it the same day. Workspace-scoped.
   */
  async sendReportNow(workspaceId: string, reportId: string) {
    const [report] = await this.loadScheduledReports(and(eq(customReports.id, reportId), eq(customReports.workspaceId, workspaceId)))
    if (!report) throw new NotFoundException('Report not found')
    const recipients = await this.deliver(report, new Date())
    return { ok: true, recipients }
  }

  /** Load scheduled reports (optionally a specific one) joined with the owner email. */
  private async loadScheduledReports(where?: ReturnType<typeof and> | ReturnType<typeof eq>): Promise<ScheduledReportRow[]> {
    const rows = await this.db
      .select({
        id: customReports.id,
        workspaceId: customReports.workspaceId,
        name: customReports.name,
        definition: customReports.definition,
        scheduleFrequency: customReports.scheduleFrequency,
        scheduleHour: customReports.scheduleHour,
        scheduleDayOfWeek: customReports.scheduleDayOfWeek,
        scheduleRecipients: customReports.scheduleRecipients,
        lastSentAt: customReports.lastSentAt,
        ownerEmail: users.email,
        createdById: customReports.createdById,
        ownerRole: users.role,
      })
      .from(customReports)
      .leftJoin(users, eq(users.id, customReports.createdById))
      .where(where ?? sql`${customReports.scheduleFrequency} <> 'none'`)
    return rows as ScheduledReportRow[]
  }

  /**
   * Run the report, render it (CSV attachment + compact HTML table), email each
   * recipient, and stamp last_sent_at. Recipients default to the report owner
   * when the schedule list is empty. Returns the resolved recipient list.
   */
  private async deliver(report: ScheduledReportRow, now: Date): Promise<string[]> {
    /*
     * RUN AS ITS OWNER, not as nobody. With no actor the report covered the
     * whole workspace, private spaces a member was refused included, and went
     * to whatever addresses that member typed — any member could save one and
     * press "send now" (`found-23-sep/workspace-reads-skip-the-container-rule`).
     * As its owner it carries what the owner could run and export themselves.
     * An owner gone from the workspace, or deleted, sends nothing: stamped, so
     * it is not reconsidered every hour.
     */
    if (!report.createdById || !(await this.ownerStillMember(report.workspaceId, report.createdById))) {
      this.logger.warn(`Scheduled report ${report.id} has no owner in its workspace; not sending it`)
      await this.stamp(report.id, now)
      return []
    }
    const recipients = this.resolveRecipients(report)
    if (recipients.length === 0) {
      this.logger.warn(`Scheduled report ${report.id} has no recipients (and no owner email); skipping`)
      // Still stamp so we don't re-evaluate it every hour with no way to deliver.
      await this.stamp(report.id, now)
      return []
    }

    const result = await this.reports.runCustomReport(report.workspaceId, report.definition ?? {}, {
      id: report.createdById,
      role: report.ownerRole,
    })
    const csv = reportResultToCsv(result)
    const columns = [humanize(result.dimension), ...result.metrics.map(humanize)]
    const tableRows = result.rows.map((r) => [r.label, ...result.metrics.map((m) => r.values[m] ?? 0)])
    const frequency: 'daily' | 'weekly' = report.scheduleFrequency === 'weekly' ? 'weekly' : 'daily'

    let delivered = 0
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
        })
        delivered += 1
      } catch (err) {
        this.logger.error(`Report ${report.id} email to ${to} failed: ${(err as Error).message}`)
      }
    }

    await this.stamp(report.id, now)
    this.logger.log(`Report "${report.name}" (${report.id}) sent to ${delivered}/${recipients.length} recipient(s)`)
    return recipients
  }

  /** Whether the report's owner is still in its workspace; a seam its tests answer. */
  protected async ownerStillMember(workspaceId: string, userId: string): Promise<boolean> {
    const [m] = await this.db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    return !!m
  }

  /** Recipients from the schedule list, or the owner email as the default. */
  private resolveRecipients(report: ScheduledReportRow): string[] {
    const list = Array.isArray(report.scheduleRecipients) ? report.scheduleRecipients : []
    const cleaned = list.map((e) => String(e ?? '').trim().toLowerCase()).filter((e) => e.length > 0)
    if (cleaned.length > 0) return [...new Set(cleaned)]
    const owner = report.ownerEmail?.trim().toLowerCase()
    return owner ? [owner] : []
  }

  private async stamp(reportId: string, now: Date) {
    await this.db.update(customReports).set({ lastSentAt: now }).where(eq(customReports.id, reportId))
  }
}
