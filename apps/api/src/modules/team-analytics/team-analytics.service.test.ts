import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ANALYTICS_MAX_DAYS, readAnalyticsRange } from './team-analytics.service'

/*
 * THE PERIOD ANALYTICS COUNTS OVER (`ledger-rows/section3-team-analytics`): the
 * last seven days when none is said, and a period that ends before it begins,
 * or runs past a quarter, refused in words.
 */
describe('readAnalyticsRange', () => {
  const now = new Date('2026-10-08T12:00:00Z')

  it('is the last seven days, ending now, when no period is said', () => {
    const r = readAnalyticsRange(undefined, undefined, now)
    assert.equal(r.ok, true)
    if (!r.ok) return
    assert.equal(r.to.toISOString(), now.toISOString())
    assert.equal(r.from.toISOString(), '2026-10-01T12:00:00.000Z')
  })

  it('takes the period said', () => {
    const r = readAnalyticsRange('2026-09-01T00:00:00Z', '2026-09-08T00:00:00Z', now)
    assert.deepEqual(r.ok && [r.from.toISOString(), r.to.toISOString()], ['2026-09-01T00:00:00.000Z', '2026-09-08T00:00:00.000Z'])
  })

  it('refuses what is no date, a period that ends before it begins, and one longer than a quarter', () => {
    assert.deepEqual(readAnalyticsRange('yesterday', undefined, now), { ok: false, reason: 'from and to must be dates' })
    assert.deepEqual(readAnalyticsRange('2026-09-08T00:00:00Z', '2026-09-01T00:00:00Z', now), { ok: false, reason: 'from must be before to' })
    assert.deepEqual(readAnalyticsRange('2026-01-01T00:00:00Z', '2026-09-01T00:00:00Z', now), { ok: false, reason: `A period is ${ANALYTICS_MAX_DAYS} days at most` })
  })
})
