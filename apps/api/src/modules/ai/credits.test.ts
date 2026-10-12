import assert from 'node:assert/strict'
import { test } from 'node:test'
import { creditMonth, creditState, creditsFor, dailySeries, packsFor } from './credits'

/**
 * AI credits as ClickUp counts them (`commit-log/log-3943965-1`): a credit is a
 * tenth of a cent of what a call cost, the month is the calendar month and
 * renews on the 1st, and the workspace is warned at 80% and paused at 100%.
 */

test('a call costs its estimated cost at a tenth of a cent a credit, and never nothing', () => {
  // claude-haiku-4-5 is $1 in, $5 out per million tokens: 1M in + 0.2M out = $2 = 2,000 credits.
  assert.equal(creditsFor('claude-haiku-4-5', 1_000_000, 200_000), 2_000)
  assert.equal(creditsFor('claude-haiku-4-5', 10, 10), 1)
  assert.equal(creditsFor('claude-haiku-4-5', 0, 0), 1)
  // A part of a credit is a whole credit.
  assert.equal(creditsFor('claude-haiku-4-5', 1_500, 0), 2)
})

test('the month is the calendar month, in UTC, and renews on the 1st', () => {
  const m = creditMonth(new Date('2026-10-31T23:59:00Z'))
  assert.equal(m.start.toISOString(), '2026-10-01T00:00:00.000Z')
  assert.equal(m.renewsAt.toISOString(), '2026-11-01T00:00:00.000Z')
  assert.equal(creditMonth(new Date('2026-12-15T00:00:00Z')).renewsAt.toISOString(), '2027-01-01T00:00:00.000Z')
})

test('credits are the members’ share and what was bought; warned from 80%, paused at 100%', () => {
  assert.deepEqual(creditState({ perMember: 1_000, members: 2, purchased: 0, used: 100 }), {
    allowance: 2_000,
    used: 100,
    left: 1_900,
    percent: 5,
    state: 'ok',
  })
  assert.equal(creditState({ perMember: 1_000, members: 2, purchased: 0, used: 1_600 }).state, 'warning')
  assert.equal(creditState({ perMember: 1_000, members: 2, purchased: 0, used: 2_000 }).state, 'paused')
  // Bought credits lift a paused month.
  const bought = creditState({ perMember: 1_000, members: 2, purchased: 10_000, used: 2_000 })
  assert.equal(bought.state, 'ok')
  assert.equal(bought.left, 10_000)
  // Unlimited is unlimited, however much is used.
  assert.equal(creditState({ perMember: null, members: 3, purchased: 0, used: 10_000_000 }).state, 'unlimited')
  // A plan with no credits is paused from the first call.
  assert.equal(creditState({ perMember: 0, members: 3, purchased: 0, used: 0 }).state, 'paused')
})

test('credits are bought in whole packs of 10,000, one to a hundred', () => {
  assert.equal(packsFor(10_000), 1)
  assert.equal(packsFor(50_000), 5)
  assert.equal(packsFor(1_000_000), 100)
  for (const bad of [0, 5_000, 15_000, 1_010_000, -10_000, '10000', null, 10_000.5]) assert.equal(packsFor(bad), null, String(bad))
})

test('each day of the month so far, with its use and the running total', () => {
  const month = creditMonth(new Date('2026-10-03T12:00:00Z'))
  const series = dailySeries(month, new Date('2026-10-03T12:00:00Z'), [
    { day: '2026-10-01', credits: 5 },
    { day: '2026-10-03', credits: 7 },
  ])
  assert.deepEqual(series, [
    { day: '2026-10-01', credits: 5, cumulative: 5 },
    { day: '2026-10-02', credits: 0, cumulative: 5 },
    { day: '2026-10-03', credits: 7, cumulative: 12 },
  ])
})
