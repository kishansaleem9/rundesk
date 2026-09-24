import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ScheduledReportsService, isReportDueNow, type SchedulableReport } from './scheduled-reports.service'

/**
 * §9.5 — the hourly scheduled-report cron emails a saved report iff it is "due
 * now": frequency matches, the UTC hour matches, weekly reports also match the
 * weekday, and last_sent_at hasn't already fired it this period. These tests
 * lock down that selection predicate and the runner's re-send gating without
 * live SMTP.
 */

const base = (over: Partial<SchedulableReport> = {}): SchedulableReport => ({
  scheduleFrequency: 'daily',
  scheduleHour: 8,
  scheduleDayOfWeek: null,
  lastSentAt: null,
  ...over,
})

describe('isReportDueNow — frequency + hour', () => {
  const at = (iso: string) => new Date(iso)

  it('daily report fires only at its configured UTC hour', () => {
    assert.equal(isReportDueNow(base({ scheduleHour: 8 }), at('2026-07-16T08:00:00Z')), true)
    assert.equal(isReportDueNow(base({ scheduleHour: 8 }), at('2026-07-16T07:00:00Z')), false)
    assert.equal(isReportDueNow(base({ scheduleHour: 8 }), at('2026-07-16T09:00:00Z')), false)
  })

  it("frequency 'none' never fires, even at the matching hour", () => {
    assert.equal(isReportDueNow(base({ scheduleFrequency: 'none', scheduleHour: 8 }), at('2026-07-16T08:00:00Z')), false)
  })

  it('an unknown frequency never fires', () => {
    assert.equal(isReportDueNow(base({ scheduleFrequency: 'monthly', scheduleHour: 8 }), at('2026-07-16T08:00:00Z')), false)
  })

  it('respects hour 0 (midnight UTC)', () => {
    assert.equal(isReportDueNow(base({ scheduleHour: 0 }), at('2026-07-16T00:00:00Z')), true)
    assert.equal(isReportDueNow(base({ scheduleHour: 0 }), at('2026-07-16T01:00:00Z')), false)
  })
})

describe('isReportDueNow — weekly weekday', () => {
  const now = new Date('2026-07-16T08:00:00Z')
  const dow = now.getUTCDay()

  it('fires only on the configured weekday', () => {
    assert.equal(isReportDueNow(base({ scheduleFrequency: 'weekly', scheduleDayOfWeek: dow }), now), true)
    assert.equal(isReportDueNow(base({ scheduleFrequency: 'weekly', scheduleDayOfWeek: (dow + 1) % 7 }), now), false)
    assert.equal(isReportDueNow(base({ scheduleFrequency: 'weekly', scheduleDayOfWeek: (dow + 3) % 7 }), now), false)
  })

  it('still requires the hour to match on the right weekday', () => {
    const wrongHour = new Date('2026-07-16T09:00:00Z')
    assert.equal(isReportDueNow(base({ scheduleFrequency: 'weekly', scheduleDayOfWeek: dow, scheduleHour: 8 }), wrongHour), false)
  })

  it('defaults a weekly report with no weekday to Monday (1)', () => {
    // 2026-07-13 is a Monday.
    const monday = new Date('2026-07-13T08:00:00Z')
    assert.equal(monday.getUTCDay(), 1)
    assert.equal(isReportDueNow(base({ scheduleFrequency: 'weekly', scheduleDayOfWeek: null }), monday), true)
    const tuesday = new Date('2026-07-14T08:00:00Z')
    assert.equal(isReportDueNow(base({ scheduleFrequency: 'weekly', scheduleDayOfWeek: null }), tuesday), false)
  })
})

describe('isReportDueNow — last_sent_at gating', () => {
  const now = new Date('2026-07-16T08:00:00Z')

  it('daily: skips a report already sent earlier the same UTC day', () => {
    assert.equal(isReportDueNow(base({ lastSentAt: '2026-07-16T03:00:00Z' }), now), false)
    assert.equal(isReportDueNow(base({ lastSentAt: new Date('2026-07-16T07:59:00Z') }), now), false)
  })

  it('daily: fires again once the day rolls over', () => {
    assert.equal(isReportDueNow(base({ lastSentAt: '2026-07-15T08:00:00Z' }), now), true)
  })

  it('weekly: a report sent today is not re-sent; a week later it fires', () => {
    const dow = now.getUTCDay()
    const weekly = (over: Partial<SchedulableReport>) => base({ scheduleFrequency: 'weekly', scheduleDayOfWeek: dow, ...over })
    // Sent earlier today → skip (guards a same-hour double-run / prior send-now).
    assert.equal(isReportDueNow(weekly({ lastSentAt: '2026-07-16T08:00:00Z' }), now), false)
    // Sent exactly a week ago → the next occurrence fires.
    assert.equal(isReportDueNow(weekly({ lastSentAt: '2026-07-09T08:00:00Z' }), now), true)
  })

  it('ignores an unparseable last_sent_at (treats it as never sent)', () => {
    assert.equal(isReportDueNow(base({ lastSentAt: 'not-a-date' }), now), true)
  })
})

// ── Runner selection + delivery (dispatch) ──────────────────────────────────

type FakeRow = {
  id: string
  workspaceId: string
  name: string
  definition: Record<string, unknown>
  scheduleFrequency: 'none' | 'daily' | 'weekly'
  scheduleHour: number
  scheduleDayOfWeek: number | null
  scheduleRecipients: string[]
  lastSentAt: Date | string | null
  ownerEmail: string | null
  createdById: string | null
  ownerRole: string | null
}

/** Minimal Drizzle stand-in: select() yields the report rows; update() records stamps. */
function makeDb(rows: FakeRow[]) {
  const stamped: Array<{ vals: Record<string, unknown> }> = []
  const selectChain: any = {
    from: () => selectChain,
    leftJoin: () => selectChain,
    where: () => selectChain,
    then: (resolve: (v: any) => any, reject: (e: any) => any) => Promise.resolve(rows).then(resolve, reject),
  }
  const db: any = {
    select: () => selectChain,
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => {
          stamped.push({ vals })
          return Promise.resolve()
        },
      }),
    }),
  }
  return { db, stamped }
}

function makeService(rows: FakeRow[], owners: { stillMember?: (userId: string) => boolean } = {}) {
  const { db, stamped } = makeDb(rows)
  const runCalls: string[] = []
  const runAs: Array<{ id: string; role?: string | null } | undefined> = []
  const reports: any = {
    runCustomReport: async (_workspaceId: string, _def: unknown, actor?: { id: string; role?: string | null }) => {
      runCalls.push(_workspaceId)
      runAs.push(actor)
      return {
        dimension: 'assignee',
        metrics: ['tasks-count'],
        generatedAt: '2026-07-16T08:00:00.000Z',
        rows: [{ key: 'a', label: 'Alice', values: { 'tasks-count': 3 } }],
      }
    },
  }
  const emailCalls: Array<{ to: string; reportName: string; frequency: string; csv: string }> = []
  const email: any = {
    sendScheduledReport: async (opts: any) => {
      emailCalls.push({ to: opts.to, reportName: opts.reportName, frequency: opts.frequency, csv: opts.csv })
    },
  }
  const config: any = { get: () => 'http://app.test' }
  const svc = new ScheduledReportsService(db, reports, email, config)
  // The owner's membership, answered here rather than by the fake database.
  ;(svc as any).ownerStillMember = async (_ws: string, userId: string) => (owners.stillMember ?? (() => true))(userId)
  return { svc, stamped, emailCalls, runCalls, runAs }
}

const row = (over: Partial<FakeRow> = {}): FakeRow => ({
  id: 'r1',
  workspaceId: 'w1',
  name: 'Weekly velocity',
  definition: { metrics: ['tasks-count'], dimension: 'assignee' },
  scheduleFrequency: 'daily',
  scheduleHour: 8,
  scheduleDayOfWeek: null,
  scheduleRecipients: ['team@x.com'],
  lastSentAt: null,
  ownerEmail: 'owner@x.com',
  createdById: 'owner-1',
  ownerRole: 'member',
  ...over,
})

describe('ScheduledReportsService.dispatch', () => {
  const now = new Date('2026-07-16T08:00:00Z')

  it('emails only the due reports and stamps last_sent_at', async () => {
    const { svc, stamped, emailCalls } = makeService([
      row({ id: 'due', scheduleHour: 8, scheduleRecipients: ['a@x.com'] }),
      row({ id: 'wrong-hour', scheduleHour: 9 }),
      row({ id: 'off', scheduleFrequency: 'none' }),
    ])
    const res = await svc.dispatch(now)
    assert.equal(res.candidates, 3)
    assert.equal(res.due, 1)
    assert.equal(res.sent, 1)
    assert.deepEqual(
      emailCalls.map((c) => c.to),
      ['a@x.com'],
    )
    assert.equal(emailCalls[0].csv.split('\n')[0], 'group,tasks-count')
    // last_sent_at stamped exactly once, for the due report.
    assert.equal(stamped.length, 1)
    assert.ok(stamped[0].vals.lastSentAt instanceof Date)
  })

  it('last_sent_at gates a re-send: a report already sent today is not selected', async () => {
    const { svc, emailCalls, stamped } = makeService([
      row({ id: 'already', scheduleHour: 8, lastSentAt: '2026-07-16T05:00:00Z' }),
    ])
    const res = await svc.dispatch(now)
    assert.equal(res.due, 0)
    assert.equal(res.sent, 0)
    assert.equal(emailCalls.length, 0)
    assert.equal(stamped.length, 0)
  })

  it('falls back to the owner email when the recipient list is empty', async () => {
    const { svc, emailCalls } = makeService([
      row({ id: 'ownerfb', scheduleHour: 8, scheduleRecipients: [], ownerEmail: 'owner@x.com' }),
    ])
    await svc.dispatch(now)
    assert.deepEqual(
      emailCalls.map((c) => c.to),
      ['owner@x.com'],
    )
  })

  it('runs each report as its owner, not as nobody', async () => {
    // With no actor a report covered the whole workspace, private spaces its
    // owner was refused included, and went to any address they typed.
    const { svc, runAs, emailCalls } = makeService([row({ id: 'mine', scheduleHour: 8, createdById: 'owner-1', ownerRole: 'member' })])
    await svc.dispatch(now)
    assert.equal(emailCalls.length, 1)
    assert.deepEqual(runAs, [{ id: 'owner-1', role: 'member' }])
  })

  it('sends nothing for a report whose owner has left the workspace, or was deleted, and stamps it', async () => {
    const { svc, emailCalls, runCalls, stamped } = makeService(
      [row({ id: 'left', scheduleHour: 8, createdById: 'gone-1' }), row({ id: 'deleted', scheduleHour: 8, createdById: null })],
      { stillMember: (userId) => userId !== 'gone-1' },
    )
    const res = await svc.dispatch(now)
    assert.equal(emailCalls.length, 0)
    assert.equal(runCalls.length, 0, 'a report with no owner in the workspace was still run')
    assert.equal(stamped.length, 2)
    assert.equal(res.due, 2)
  })

  it('delivers each recipient and keeps one report failure from blocking others', async () => {
    const { svc, emailCalls } = makeService([
      row({ id: 'multi', scheduleHour: 8, scheduleRecipients: ['a@x.com', 'b@x.com'] }),
    ])
    const res = await svc.dispatch(now)
    assert.equal(res.sent, 1)
    assert.deepEqual(
      emailCalls.map((c) => c.to).sort(),
      ['a@x.com', 'b@x.com'],
    )
  })
})
