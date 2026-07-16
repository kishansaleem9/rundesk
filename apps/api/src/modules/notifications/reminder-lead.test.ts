import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  normalizeReminderLeadDays,
  reminderLeadLabel,
  DEFAULT_REMINDER_LEAD_DAYS,
  ALLOWED_REMINDER_LEAD_DAYS,
} from './notifications.service'

/**
 * §10.4 — the reminder cron fires a due-soon notification when a task's
 * whole-calendar-day distance from "today" is one of the assignee's configured
 * lead days. These pure helpers decide (a) which lead days are valid and
 * (b) the human label. Locking them down guards the selection logic the cron
 * depends on.
 */

describe('normalizeReminderLeadDays', () => {
  it('defaults to [1, 2] when the value is absent or not an array', () => {
    assert.deepEqual(normalizeReminderLeadDays(undefined), [1, 2])
    assert.deepEqual(normalizeReminderLeadDays(null), [1, 2])
    assert.deepEqual(normalizeReminderLeadDays('nope'), [1, 2])
    assert.deepEqual(normalizeReminderLeadDays(7), [1, 2])
    // Not shared with the exported constant (callers must not mutate defaults).
    assert.notEqual(normalizeReminderLeadDays(undefined), DEFAULT_REMINDER_LEAD_DAYS)
  })

  it('respects an explicit empty array (overdue-only)', () => {
    assert.deepEqual(normalizeReminderLeadDays([]), [])
  })

  it('keeps only the allowed set {1, 2, 7}, de-duped and sorted', () => {
    assert.deepEqual(normalizeReminderLeadDays([2, 1]), [1, 2])
    assert.deepEqual(normalizeReminderLeadDays([7, 1, 2]), [1, 2, 7])
    assert.deepEqual(normalizeReminderLeadDays([1, 1, 2, 2]), [1, 2])
    assert.deepEqual(normalizeReminderLeadDays([7]), [7])
  })

  it('drops out-of-set, non-integer, and non-numeric entries', () => {
    assert.deepEqual(normalizeReminderLeadDays([3, 5, 14, 0, -1]), [])
    assert.deepEqual(normalizeReminderLeadDays([1.5, 2.9]), [])
    assert.deepEqual(normalizeReminderLeadDays([1, 'x', 2, null, {}]), [1, 2])
  })

  it('coerces numeric strings that land in the allowed set', () => {
    assert.deepEqual(normalizeReminderLeadDays(['1', '7']), [1, 7])
  })

  it('every allowed value survives normalization', () => {
    for (const d of ALLOWED_REMINDER_LEAD_DAYS) {
      assert.deepEqual(normalizeReminderLeadDays([d]), [d])
    }
  })
})

describe('reminderLeadLabel', () => {
  it('labels 1 day out as "tomorrow"', () => {
    assert.equal(reminderLeadLabel(1), 'tomorrow')
    assert.equal(reminderLeadLabel(0), 'tomorrow')
  })

  it('labels a week out as "in 1 week"', () => {
    assert.equal(reminderLeadLabel(7), 'in 1 week')
  })

  it('labels other offsets as "in N days"', () => {
    assert.equal(reminderLeadLabel(2), 'in 2 days')
    assert.equal(reminderLeadLabel(3), 'in 3 days')
  })
})

describe('lead-day selection (cron predicate)', () => {
  // Mirrors the cron: fire iff the task's calendar-day distance is one of the
  // user's configured lead days.
  const fires = (diffDays: number, stored: unknown) =>
    normalizeReminderLeadDays(stored).includes(diffDays)

  it('default user is reminded 1 and 2 days out, but not at 7 or same-day', () => {
    assert.equal(fires(1, undefined), true)
    assert.equal(fires(2, undefined), true)
    assert.equal(fires(7, undefined), false)
    assert.equal(fires(0, undefined), false)
  })

  it('a user who opted into 1 week is reminded at 7 days too', () => {
    assert.equal(fires(7, [1, 2, 7]), true)
    assert.equal(fires(2, [1, 2, 7]), true)
  })

  it('a user with only 1-week lead is not reminded at 1 or 2 days', () => {
    assert.equal(fires(1, [7]), false)
    assert.equal(fires(2, [7]), false)
    assert.equal(fires(7, [7]), true)
  })

  it('a user with no lead days is never reminded (overdue only)', () => {
    assert.equal(fires(1, []), false)
    assert.equal(fires(2, []), false)
    assert.equal(fires(7, []), false)
  })
})
