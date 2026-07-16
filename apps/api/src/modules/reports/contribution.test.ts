import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ReportsService,
  monthPeriodRange,
  scoreContribution,
  contributionNarrativeFallback,
} from './reports.service'

/**
 * §7.14 contribution analytics. The pure period/score/narrative helpers are
 * tested directly; the factor math + PDF bytes are exercised via getContribution
 * against a mocked Drizzle (no AiService → deterministic narratives, heuristic
 * source), so it is fully testable without a live model.
 */

describe('monthPeriodRange (§7.14 period selector)', () => {
  it('resolves this-month from the 1st (UTC) to now', () => {
    const now = new Date('2026-07-16T12:00:00Z')
    const r = monthPeriodRange('this-month', now)
    assert.equal(r.from.toISOString(), '2026-07-01T00:00:00.000Z')
    assert.equal(r.to.toISOString(), now.toISOString())
    assert.equal(r.label, 'July 2026')
  })
  it('resolves last-month to the full previous calendar month', () => {
    const r = monthPeriodRange('last-month', new Date('2026-07-16T12:00:00Z'))
    assert.equal(r.from.toISOString(), '2026-06-01T00:00:00.000Z')
    assert.equal(r.to.toISOString(), '2026-06-30T23:59:59.999Z')
    assert.equal(r.label, 'June 2026')
  })
  it('handles the January → previous-December year rollover', () => {
    const r = monthPeriodRange('last-month', new Date('2026-01-10T00:00:00Z'))
    assert.equal(r.label, 'December 2025')
  })
})

describe('scoreContribution (§7.14 factor math)', () => {
  it('weights completed work + blockers, with on-time and collaboration secondary', () => {
    // 4*3 + 2*2 + round(75/10)=8 + min(20,7)=7 → 31
    assert.equal(scoreContribution({ tasksCompleted: 4, onTimeRate: 75, collaboration: 7, blockersResolved: 2 }), 31)
    assert.equal(scoreContribution({ tasksCompleted: 0, onTimeRate: 0, collaboration: 0, blockersResolved: 0 }), 0)
    // collaboration is capped at 20
    assert.equal(scoreContribution({ tasksCompleted: 0, onTimeRate: 0, collaboration: 999, blockersResolved: 0 }), 20)
  })
})

describe('contributionNarrativeFallback (§7.14 AI fallback)', () => {
  it('summarizes the real factors in one sentence', () => {
    const s = contributionNarrativeFallback({
      name: 'Alice',
      tasksCompleted: 4,
      onTimeRate: 75,
      collaboration: 7,
      blockersResolved: 2,
    })
    assert.equal(s, 'Alice completed 4 tasks (75% on time), resolved 2 blockers, and logged 7 collaboration touchpoints.')
  })
  it('states the no-activity case', () => {
    assert.match(
      contributionNarrativeFallback({ name: 'Bob', tasksCompleted: 0, onTimeRate: 0, collaboration: 0, blockersResolved: 0 }),
      /Bob has no recorded activity/,
    )
  })
})

// Queued-result Drizzle mock: each top-level select() yields the next array.
function makeDb(selectResults: any[][]) {
  let i = 0
  const chain = (rows: any[]): any => {
    const c: any = {
      from: () => c,
      where: () => c,
      innerJoin: () => c,
      leftJoin: () => c,
      groupBy: () => c,
      orderBy: () => c,
      limit: () => c,
      then: (resolve: (v: any) => any, reject: (e: any) => any) => Promise.resolve(rows).then(resolve, reject),
    }
    return c
  }
  return { select: () => chain(selectResults[i++] ?? []) } as any
}

// members, then completed rows, then activity rows (getContribution's 3 selects).
const contributionRows = () => [
  [
    { userId: 'a', name: 'Alice', email: 'a@x.com' },
    { userId: 'b', name: 'Bob', email: 'b@x.com' },
  ],
  [
    { userId: 'a', completed: 4, onTime: 3, assigned: 5 },
    { userId: 'b', completed: 0, onTime: 0, assigned: 1 },
  ],
  [
    { actorId: 'a', action: 'commented', count: 5 },
    { actorId: 'a', action: 'dependency_removed', count: 2 },
    { actorId: 'b', action: 'assigned', count: 1 },
  ],
]

describe('ReportsService.getContribution (§7.14)', () => {
  it('computes per-member factors, sorts by score, and attaches a narrative', async () => {
    const svc = new ReportsService(makeDb(contributionRows()))
    const res = await svc.getContribution('w1', { period: 'this-month' })
    assert.equal(res.source, 'heuristic') // no AiService injected
    assert.equal(res.period.type, 'this-month')

    // Sorted by score desc → Alice (31) before Bob (1).
    assert.equal(res.members[0].name, 'Alice')
    const alice = res.members[0]
    assert.equal(alice.tasksCompleted, 4)
    assert.equal(alice.onTimeRate, 75)
    assert.equal(alice.collaboration, 7) // 5 commented + 2 dependency_removed
    assert.equal(alice.blockersResolved, 2)
    assert.equal(alice.score, 31)
    assert.match(alice.narrative, /Alice completed 4 tasks \(75% on time\), resolved 2 blockers/)

    const bob = res.members[1]
    assert.equal(bob.tasksCompleted, 0)
    assert.equal(bob.collaboration, 1)
    assert.equal(bob.score, 1)
  })
})

describe('ReportsService.exportContributionPdf (§7.14 PDF bytes)', () => {
  it('renders a valid PDF buffer', async () => {
    const svc = new ReportsService(makeDb(contributionRows()))
    const buf = await svc.exportContributionPdf('w1', { period: 'this-month' })
    assert.ok(Buffer.isBuffer(buf))
    assert.ok(buf.length > 200)
    const head = buf.subarray(0, 8).toString('latin1')
    assert.match(head, /^%PDF-1\./)
    assert.ok(buf.subarray(-6).toString('latin1').includes('%%EOF'))
  })
})
