import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { toDateInput, toDateTimeInput, fromDateTimeInput, withDatePart, presetToIso, shownDay, shiftByDays, dayAsDateOnly } from './task-dates'

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

/**
 * The zones a person may be in, for the checks below: one west of UTC, UTC,
 * and one east. Node takes `TZ` as it is set, so each check runs in each.
 */
const ZONES = ['America/Los_Angeles', 'UTC', 'Asia/Karachi']
function inZone(zone: string, check: () => void) {
  const was = process.env.TZ
  process.env.TZ = zone
  try {
    check()
  } finally {
    if (was === undefined) delete process.env.TZ
    else process.env.TZ = was
  }
}
const inEachZone = (check: (zone: string) => void) => {
  for (const zone of ZONES) inZone(zone, () => check(zone))
}

/**
 * `found-5-oct/timeline-press-moves-dates` — a Gantt draws a date on the day it
 * is shown as, and a drag moves it by whole days, keeping its time.
 */
describe('a Gantt draws and moves a date as the day it is shown as', () => {
  it('draws a date-only day as that day in every zone, and a timed one on its local day', () => {
    inEachZone((zone) => {
      const day = shownDay('2026-10-19T00:00:00.000Z')!
      assert.deepEqual([day.getFullYear(), day.getMonth() + 1, day.getDate(), day.getHours()], [2026, 10, 19, 0], zone)
      // 16 October 09:00Z is the 16th in all three: 02:00 in Los Angeles, 14:00 in Karachi.
      const timed = shownDay('2026-10-16T09:00:00.000Z')!
      assert.deepEqual([timed.getDate(), timed.getHours(), timed.getMinutes()], [16, 0, 0], zone)
    })
    assert.equal(shownDay(null), null)
    assert.equal(shownDay('not a date'), null)
  })

  it('moves a timed date by whole days and keeps its time of day, across a change of the clocks too', () => {
    inEachZone((zone) => {
      // Due 17:30Z and starting 09:00Z, moved a day on: the same clock, a day later.
      assert.equal(shiftByDays('2026-10-09T17:30:00.000Z', 1), '2026-10-10T17:30:00.000Z', zone)
      assert.equal(shiftByDays('2026-10-07T09:00:00.000Z', -3), '2026-10-04T09:00:00.000Z', zone)
      // Nought days is the date as it was.
      assert.equal(shiftByDays('2026-10-07T09:00:00.000Z', 0), '2026-10-07T09:00:00.000Z', zone)
    })
    inZone('America/Los_Angeles', () => {
      // 09:00 on 31 October (PDT, 16:00Z) is 09:00 on 2 November (PST, 17:00Z), as a picked day keeps it.
      assert.equal(shiftByDays('2026-10-31T16:00:00.000Z', 2), '2026-11-02T17:00:00.000Z')
      assert.equal(shiftByDays('2026-10-31T16:00:00.000Z', 2), withDatePart('2026-10-31T16:00:00.000Z', '2026-11-02'))
    })
    // A date the task does not have is not made.
    assert.equal(shiftByDays(null, 1), null)
    assert.equal(shiftByDays(undefined, 1), null)
  })

  it('moves a date-only day to the next day, still date-only, in every zone', () => {
    inEachZone((zone) => {
      assert.equal(shiftByDays('2026-10-12T00:00:00.000Z', 1), '2026-10-13T00:00:00.000Z', zone)
      assert.equal(shiftByDays('2026-10-31T00:00:00.000Z', 1), '2026-11-01T00:00:00.000Z', zone)
      assert.equal(shiftByDays('2026-10-12T00:00:00.000Z', 0), '2026-10-12T00:00:00.000Z', zone)
    })
  })

  it('stores a day with no time as the date-only form, whatever the zone', () => {
    inEachZone((zone) => {
      const day = shownDay('2026-10-12T00:00:00.000Z')!
      day.setDate(day.getDate() - 1)
      assert.equal(dayAsDateOnly(day), '2026-10-11T00:00:00.000Z', zone)
    })
  })
})

/**
 * `found-5-oct/years-below-100-read-back-wrong` — a year below 100 is shown and
 * written as that year. `String(2)` drew `2-10-06`, a value no date box shows,
 * and `new Date(2, …)` and `Date.UTC(2, …)` write 1902.
 */
describe('a year below 100 is the year it says', () => {
  it('is shown with four digits, written as that year, and moved within it', () => {
    inEachZone((zone) => {
      assert.equal(toDateInput('0002-10-06T00:00:00.000Z'), '0002-10-06', zone)
      assert.equal(toDateTimeInput('0002-10-06T00:00:00.000Z'), '0002-10-06T00:00', zone)
      assert.equal(withDatePart(null, '0002-10-06'), '0002-10-06T00:00:00.000Z', zone)
      assert.equal(withDatePart('2026-10-06T00:00:00.000Z', '0099-10-07'), '0099-10-07T00:00:00.000Z', zone)
      assert.equal(toDateTimeInput(withDatePart(fromDateTimeInput('2026-10-06T17:30'), '0002-10-06')), '0002-10-06T17:30', zone)
      assert.equal(shiftByDays('0002-10-06T00:00:00.000Z', 1), '0002-10-07T00:00:00.000Z', zone)
      assert.equal(shownDay('0002-10-06T00:00:00.000Z')!.getFullYear(), 2, zone)
      assert.equal(dayAsDateOnly(shownDay('0002-10-06T00:00:00.000Z')!), '0002-10-06T00:00:00.000Z', zone)
    })
    inZone('UTC', () => {
      assert.equal(toDateTimeInput('0099-10-06T09:00:00.000Z'), '0099-10-06T09:00')
      assert.equal(toDateTimeInput(fromDateTimeInput('0002-10-06T09:00')), '0002-10-06T09:00')
    })
  })
})
