import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { toDateInput, toDateTimeInput, fromDateTimeInput, withDatePart, presetToIso, datesOutOfOrder, startMaxFor } from './task-dates'

/*
 * `found-30-sep/a-task-starts-after-it-is-due` — the create modal asks this of
 * its two boxes before Create, and says so beside them.
 */
describe('datesOutOfOrder — a start typed after the due date', () => {
  it('is out of order only when both are set and the start is after the due, to the minute', () => {
    assert.equal(datesOutOfOrder('2026-10-10T09:00', '2026-10-03T17:00'), true)
    assert.equal(datesOutOfOrder('2026-10-03T17:01', '2026-10-03T17:00'), true)
    assert.equal(datesOutOfOrder('2026-10-03T17:00', '2026-10-03T17:00'), false)
    assert.equal(datesOutOfOrder('2026-10-01T09:00', '2026-10-03T17:00'), false)
    assert.equal(datesOutOfOrder('', '2026-10-03T17:00'), false)
    assert.equal(datesOutOfOrder('2026-10-10T09:00', ''), false)
  })

  it('bounds the start box by the due moment, or by the end of a due day with no time on it', () => {
    const due = new Date(2026, 9, 3, 17, 30).toISOString()
    assert.equal(startMaxFor(due), '2026-10-03T17:30')
    assert.equal(startMaxFor('2026-10-05T00:00:00.000Z'), '2026-10-05T23:59')
    assert.equal(startMaxFor(null), undefined)
    assert.equal(startMaxFor('not a date'), undefined)
  })
})

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

/**
 * §G15 frame #9 — the presets beside the date.
 *
 * "now" is injected on every one of these. A preset function that reads the
 * clock itself can only be tested on the day it happens to be, which is how
 * date code passes all week and fails on a Sunday.
 */
describe('§G15 date presets', () => {
  // A Wednesday, so weekday/weekend arithmetic is unambiguous.
  const wed = new Date(2026, 8, 16, 11, 0)

  it('today, tomorrow and the fixed offsets', () => {
    const day = (iso: string) => toDateInput(iso)
    assert.equal(day(presetToIso('today', null, wed)), '2026-09-16')
    assert.equal(day(presetToIso('tomorrow', null, wed)), '2026-09-17')
    assert.equal(day(presetToIso('nextWeek', null, wed)), '2026-09-23')
    assert.equal(day(presetToIso('twoWeeks', null, wed)), '2026-09-30')
    assert.equal(day(presetToIso('fourWeeks', null, wed)), '2026-10-14')
  })

  it('"this weekend" is the coming Saturday', () => {
    assert.equal(toDateInput(presetToIso('thisWeekend', null, wed)), '2026-09-19')
  })

  it('and never points backwards when you are already in the weekend', () => {
    /*
     * On a Saturday the answer is today. On a Sunday the weekend you are in
     * has one day left — "this weekend" meaning yesterday is the only clearly
     * wrong answer available.
     */
    const sat = new Date(2026, 8, 19, 11, 0)
    const sun = new Date(2026, 8, 20, 11, 0)
    assert.equal(toDateInput(presetToIso('thisWeekend', null, sat)), '2026-09-19')
    assert.equal(toDateInput(presetToIso('thisWeekend', null, sun)), '2026-09-20')
  })

  it('carries the time already on the row', () => {
    // A deadline at 17:30 moved to "next week" is still due at 17:30.
    const at1730 = new Date(2026, 8, 15, 17, 30).toISOString()
    assert.equal(toDateTimeInput(presetToIso('nextWeek', at1730, wed)), '2026-09-23T17:30')
  })

  it('and leaves a date-only row date-only', () => {
    // Otherwise every use of a preset would silently stamp 00:00 local on a
    // task that never had a time, which is the drift this module exists to stop.
    const dateOnly = '2026-09-10T00:00:00.000Z'
    assert.equal(presetToIso('tomorrow', dateOnly, wed), '2026-09-17T00:00:00.000Z')
  })
})
