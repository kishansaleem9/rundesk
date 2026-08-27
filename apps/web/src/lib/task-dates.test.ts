import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { toDateInput, toDateTimeInput, fromDateTimeInput, withDatePart } from './task-dates'

/**
 * §G [21:36–23:38] — "START date aur DUE date … TIME ke saath."
 *
 * The audit that found this did not find a missing feature; it found a control
 * that could not represent what the column behind it was already holding. The
 * API stored `2026-09-15T17:30:00.000Z` perfectly well. The sheet showed
 * `2026-09-15`, and one nudge of the day wrote back `2026-09-16T00:00:00.000Z`
 * — the 17:30 gone, nothing raised, nothing to notice.
 *
 * So the tests that matter here are the losing ones: not "can a time be set"
 * but "is a time still there afterwards".
 */
describe('§G task dates carry a time', () => {
  it('renders a real time as local wall-clock, not UTC', () => {
    // Fixed by construction rather than by a literal, so this reads the same
    // in every zone CI might run in.
    const local = new Date(2026, 8, 15, 17, 30)
    assert.equal(toDateTimeInput(local.toISOString()), '2026-09-15T17:30')
  })

  it('round-trips through the control without drift', () => {
    const there = fromDateTimeInput('2026-09-15T17:30')
    assert.ok(there)
    assert.equal(toDateTimeInput(there), '2026-09-15T17:30')
    // And again, because a value that survives one trip and not two is the
    // shape of an off-by-one-offset bug.
    assert.equal(toDateTimeInput(fromDateTimeInput(toDateTimeInput(there))!), '2026-09-15T17:30')
  })

  it('shows a date-only row as the day it was picked, in any zone', () => {
    /*
     * Every row written before this existed is UTC midnight, because that is
     * what `new Date('2026-09-16')` parses to. Translated literally into local
     * terms, a task due "the 16th" would read 05:00 on the 16th in Karachi and
     * 17:00 on the 15th in Los Angeles — the whole estate appearing to shift
     * by a day the moment this shipped.
     */
    assert.equal(toDateTimeInput('2026-09-16T00:00:00.000Z'), '2026-09-16T00:00')
    assert.equal(toDateInput('2026-09-16T00:00:00.000Z'), '2026-09-16')
  })

  it('picking midnight is stable rather than drifting a day per save', () => {
    // Local midnight is not UTC midnight anywhere but UTC, so it comes back
    // through the other branch. It has to land on the same face regardless.
    const iso = fromDateTimeInput('2026-09-16T00:00')
    assert.equal(toDateTimeInput(iso), '2026-09-16T00:00')
    assert.equal(toDateTimeInput(fromDateTimeInput(toDateTimeInput(iso))!), '2026-09-16T00:00')
  })

  it('empty in, empty out — a date can be cleared', () => {
    assert.equal(toDateTimeInput(null), '')
    assert.equal(toDateTimeInput(undefined), '')
    assert.equal(toDateInput(''), '')
    assert.equal(fromDateTimeInput(''), null)
    assert.equal(withDatePart('2026-09-15T17:30:00.000Z', ''), null)
  })

  it('survives a value it cannot parse instead of rendering "Invalid Date"', () => {
    assert.equal(toDateTimeInput('not a date'), '')
    assert.equal(toDateInput('not a date'), '')
    assert.equal(fromDateTimeInput('not a date'), null)
  })
})

describe('§G a coarse picker does not destroy what it cannot show', () => {
  it('keeps the time of day when only the day changes', () => {
    // This is the bug, stated: 17:30 on the 15th, moved to the 16th.
    const at1730 = new Date(2026, 8, 15, 17, 30).toISOString()
    const moved = withDatePart(at1730, '2026-09-16')
    assert.ok(moved)
    assert.equal(toDateTimeInput(moved), '2026-09-16T17:30')
  })

  it('leaves a date-only row exactly as it was stored', () => {
    /*
     * A row with no time on it must keep being written the way it always was —
     * UTC midnight. Writing local midnight instead would move every date-only
     * task by one timezone offset the first time anybody nudged it, which is
     * the same silent corruption in the other direction.
     */
    assert.equal(withDatePart('2026-09-16T00:00:00.000Z', '2026-09-17'), '2026-09-17T00:00:00.000Z')
    assert.equal(withDatePart(null, '2026-09-17'), '2026-09-17T00:00:00.000Z')
  })

  it('refuses a malformed day rather than inventing one', () => {
    assert.equal(withDatePart('2026-09-16T00:00:00.000Z', 'tomorrow'), null)
    assert.equal(withDatePart(null, '2026-09'), null)
  })
})
