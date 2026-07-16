import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { projectHealthScores } from '@rundesk/db'
import {
  ProjectHealthService,
  foldSentimentIntoHealth,
  bandForScore,
  utcDayString,
  SENTIMENT_WEIGHT,
} from './project-health.service'

/**
 * §7.13 — the daily project-health cron reuses getProjectHealth's deterministic
 * signals and folds in a comment-sentiment component with a fixed weight, then
 * upserts one row per project per day keyed by (project_id, scored_on). These
 * lock down the blend math and prove the upsert is idempotent (ON CONFLICT on
 * the day key) without a live database.
 */

describe('bandForScore (§7.13)', () => {
  it('applies the shared thresholds green ≥ 75, yellow ≥ 50, else red', () => {
    assert.equal(bandForScore(75), 'green')
    assert.equal(bandForScore(74), 'yellow')
    assert.equal(bandForScore(50), 'yellow')
    assert.equal(bandForScore(49), 'red')
    assert.equal(bandForScore(0), 'red')
  })
})

describe('foldSentimentIntoHealth (§7.13)', () => {
  const base = (score: number, band: string) => ({
    score,
    band,
    components: { onTime: 100, overdue: 100, blockers: 100, activity: 100 },
  })

  it('leaves empty projects at score 0 / band empty (sentiment never resurrects them)', () => {
    const r = foldSentimentIntoHealth(base(0, 'empty'), 100)
    assert.equal(r.score, 0)
    assert.equal(r.band, 'empty')
    assert.equal(r.components.sentiment, 100)
  })

  it('blends sentiment at the documented 15% weight', () => {
    // 80 * 0.85 + 0 * 0.15 = 68 → drops a green project to yellow.
    const r = foldSentimentIntoHealth(base(80, 'green'), 0)
    assert.equal(SENTIMENT_WEIGHT, 0.15)
    assert.equal(r.score, 68)
    assert.equal(r.band, 'yellow')
    assert.equal(r.components.sentiment, 0)
  })

  it('is a no-op on the score when sentiment equals the base score', () => {
    const r = foldSentimentIntoHealth(base(60, 'yellow'), 60)
    assert.equal(r.score, 60)
    assert.equal(r.band, 'yellow')
  })

  it('lifts a struggling project when discussion is very positive', () => {
    // 40 * 0.85 + 100 * 0.15 = 49 → still red but improved.
    const r = foldSentimentIntoHealth(base(40, 'red'), 100)
    assert.equal(r.score, 49)
    assert.equal(r.band, 'red')
  })

  it('clamps sentiment into 0..100', () => {
    assert.equal(foldSentimentIntoHealth(base(50, 'yellow'), 500).components.sentiment, 100)
    assert.equal(foldSentimentIntoHealth(base(50, 'yellow'), -20).components.sentiment, 0)
  })
})

describe('utcDayString (§7.13)', () => {
  it('formats the UTC calendar day (the scored_on key)', () => {
    assert.equal(utcDayString(new Date('2026-07-16T23:30:00Z')), '2026-07-16')
    assert.equal(utcDayString(new Date('2026-01-02T00:00:00Z')), '2026-01-02')
  })
})

/** Mock db that records the insert values + the onConflict config it was given. */
function recordingDb() {
  const calls: Array<{ values: any; conflict: any }> = []
  const db: any = {
    insert: () => ({
      values: (values: any) => ({
        onConflictDoUpdate: (conflict: any) => {
          calls.push({ values, conflict })
          return Promise.resolve()
        },
      }),
    }),
  }
  return { db, calls }
}

describe('ProjectHealthService.upsertProjectScore idempotency (§7.13)', () => {
  it('upserts ON CONFLICT (project_id, scored_on) so a re-run the same day updates in place', async () => {
    const { db, calls } = recordingDb()
    const svc = new ProjectHealthService(db, null as any, null as any)
    const row = {
      projectId: 'p1',
      workspaceId: 'w1',
      score: 82,
      band: 'green',
      components: { onTime: 90, overdue: 80, blockers: 100, activity: 70, sentiment: 60 },
      sentiment: { score: 60, label: 'neutral' as const, positive: 1, negative: 0, samples: 3, source: 'deterministic' as const },
      scoredOn: '2026-07-16',
    }

    // Two runs the same day with the same key = the daily cron re-firing.
    await svc.upsertProjectScore(row)
    await svc.upsertProjectScore({ ...row, score: 84 })

    assert.equal(calls.length, 2)
    // Conflict target is exactly the day-unique key columns.
    for (const c of calls) {
      assert.deepEqual(c.conflict.target, [projectHealthScores.projectId, projectHealthScores.scoredOn])
      // The mutable metrics are in the update set (so the re-run overwrites).
      assert.ok('score' in c.conflict.set && 'band' in c.conflict.set && 'sentiment' in c.conflict.set)
    }
    assert.equal(calls[0].values.scoredOn, '2026-07-16')
    assert.equal(calls[1].values.score, 84)
  })
})

/** Mock db whose select() chain resolves to a fixed set of rows. */
function selectDb(rows: any[]) {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    orderBy: () => chain,
    groupBy: () => chain,
    limit: () => chain,
    then: (resolve: (v: any) => any, reject: (e: any) => any) => Promise.resolve(rows).then(resolve, reject),
  }
  return { select: () => chain } as any
}

describe('ProjectHealthService.getTrend (§7.13)', () => {
  it('returns points oldest→newest with the latest as current', async () => {
    const rows = [
      { scoredOn: '2026-07-14', score: 70, band: 'yellow', components: {}, sentiment: { score: 50 } },
      { scoredOn: '2026-07-15', score: 78, band: 'green', components: {}, sentiment: { score: 60 } },
      { scoredOn: '2026-07-16', score: 82, band: 'green', components: {}, sentiment: { score: 65 } },
    ]
    const svc = new ProjectHealthService(selectDb(rows), null as any, null as any)
    const trend = await svc.getTrend('w1', 'p1', 30)
    assert.equal(trend.points.length, 3)
    assert.equal(trend.points[0].date, '2026-07-14')
    assert.deepEqual(trend.current, { score: 82, band: 'green', sentiment: { score: 65 } })
    assert.equal(trend.days, 30)
  })

  it('clamps the day horizon and reports a null current with no history', async () => {
    const svc = new ProjectHealthService(selectDb([]), null as any, null as any)
    const trend = await svc.getTrend('w1', 'p1', 9999)
    assert.equal(trend.days, 365)
    assert.equal(trend.current, null)
    assert.deepEqual(trend.points, [])
  })
})
