import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { plannerRange, plannerStep, PLANNER_VIEW_KEYS } from './planner-view.ts'

/** Wednesday 9 September 2026. */
const WED = new Date(2026, 8, 9)

const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

describe('plannerRange', () => {
  it('Day is the one day', () => {
    const days = plannerRange('day', WED, 1, true)
    assert.equal(days.length, 1)
    assert.equal(ymd(days[0]), '2026-9-9')
  })

  it('4 days runs forward from the anchor, not from the week', () => {
    // The frame's label is "4 days", not "the first four of this week".
    const days = plannerRange('four', WED, 1, true)
    assert.deepEqual(days.map(ymd), ['2026-9-9', '2026-9-10', '2026-9-11', '2026-9-12'])
  })

  it('Week honours the account’s first day', () => {
    assert.equal(ymd(plannerRange('week', WED, 1, true)[0]), '2026-9-7') // Monday
    assert.equal(ymd(plannerRange('week', WED, 0, true)[0]), '2026-9-6') // Sunday
  })

  it('Month is that month, first to last', () => {
    const days = plannerRange('month', WED, 1, true)
    assert.equal(days.length, 30)
    assert.equal(ymd(days[0]), '2026-9-1')
    assert.equal(ymd(days[29]), '2026-9-30')
  })

  it('hides weekends on Week and Month when asked', () => {
    assert.equal(plannerRange('week', WED, 1, false).length, 5)
    assert.equal(
      plannerRange('month', WED, 1, false).every((d) => d.getDay() !== 0 && d.getDay() !== 6),
      true,
    )
  })

  it('but never on Day or 4 days', () => {
    // Navigating to a Saturday and being shown nothing is not a preference
    // being honoured, it is a blank screen.
    const sat = new Date(2026, 8, 12)
    assert.equal(plannerRange('day', sat, 1, false).length, 1)
    assert.equal(plannerRange('four', sat, 1, false).length, 4)
  })
})

describe('plannerStep', () => {
  it('moves one span, not always a week', () => {
    assert.equal(ymd(plannerStep('day', WED, 1)), '2026-9-10')
    assert.equal(ymd(plannerStep('four', WED, 1)), '2026-9-13')
    assert.equal(ymd(plannerStep('week', WED, 1)), '2026-9-16')
    assert.equal(ymd(plannerStep('month', WED, 1)), '2026-10-1')
  })

  it('and backwards the same amount', () => {
    assert.equal(ymd(plannerStep('four', WED, -1)), '2026-9-5')
    assert.equal(ymd(plannerStep('month', WED, -1)), '2026-8-1')
  })

  it('steps months without skipping a short one', () => {
    // From 31 January, +1 month on the raw date lands on 31 February, which
    // JavaScript silently rolls into March — a month nobody asked for.
    const jan31 = new Date(2026, 0, 31)
    assert.equal(ymd(plannerStep('month', jan31, 1)), '2026-2-1')
  })
})

describe('the frame’s shortcuts', () => {
  it('are d x w m, in that order', () => {
    assert.deepEqual(PLANNER_VIEW_KEYS, { d: 'day', x: 'four', w: 'week', m: 'month' })
  })
})
