/**
 * §G [21:36–23:38] — a start and a due date, with a time on them.
 *
 * > "START date aur DUE date dono set kar sakte ho — TIME ke saath."
 *
 * `start_date` and `due_date` are `timestamp with time zone`, the API parses
 * whatever string you send it, and every reader downstream — the calendar, the
 * Gantt, "due soon", the reminder job — reads a real instant. The one thing
 * that could never produce one was the app: both fields were `<input
 * type="date">`, so the only instant a person could ever write was midnight.
 *
 * The sharper half is what that did to a time already on the row. A date input
 * hands back `YYYY-MM-DD`; sending it as-is re-parsed to midnight, so nudging a
 * deadline from the 15th to the 16th silently threw away the 17:30 that was on
 * it. Nothing errored and nothing showed the loss — the field simply could not
 * represent what it was holding, so it overwrote it. That is why the date-only
 * pickers that remain (the list row, the subtask row) go through
 * `withDatePart`: they change the day and leave the clock alone.
 *
 * Everything here is local-time. That is not a new convention — the list rows
 * already render due dates with date-fns `format`, which is local — it is the
 * storage side finally agreeing with it.
 */

const pad = (n: number) => String(n).padStart(2, '0')
/*
 * A year as a date box writes it: four digits at the least. `String(2)` made
 * `2-10-06`, which a box cannot show, so a start stored in year 2 drew an empty
 * box (`found-5-oct/years-below-100-read-back-wrong`).
 */
const padYear = (y: number) => String(y).padStart(4, '0')

/**
 * A local calendar day at a local clock time. `new Date(y, m, d, …)` takes a
 * year of 0–99 as 1900–1999, so a day typed in year 2 was written as 1902; the
 * setters take the year as given.
 */
function localAt(y: number, m: number, d: number, h = 0, min = 0): Date {
  const at = new Date(0)
  at.setFullYear(y, m, d)
  at.setHours(h, min, 0, 0)
  return at
}

/** UTC midnight of a calendar day, the date-only form — and year-safe, as `localAt` is. */
function utcMidnight(y: number, m: number, d: number): Date {
  const at = new Date(0)
  at.setUTCFullYear(y, m, d)
  at.setUTCHours(0, 0, 0, 0)
  return at
}

/**
 * Is this a date with no time of day?
 *
 * A date picked without a time is stored at UTC midnight, because that is what
 * `new Date('2026-09-16')` parses to. Read literally in local time, every one
 * of them would sprout a clock — a task due "the 16th" would show as 05:00 on
 * the 16th in Karachi and 17:00 on the 15th in Los Angeles. So a value with no
 * time in it is shown as the date it was picked as, and only a value that
 * carries a real time is translated into local terms.
 *
 * WHICH IT IS, THE TASK SAYS (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`):
 * `startDateHasTime` and `dueDateHasTime`, kept beside each date as ClickUp
 * keeps `due_date_time`. This read the instant alone — every UTC midnight a date
 * with no time — and a real time can be UTC midnight as well: 17:00 typed in
 * Los Angeles in October, 05:00 in Karachi, saved and read back as a date with
 * no time. The instant is still the answer for a value the caller has no flag
 * for (`hasTime` undefined), as it was for every value until the flag was kept.
 */
function isDateOnly(d: Date, hasTime?: boolean): boolean {
  if (hasTime !== undefined) return !hasTime
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0
}

/**
 * Does a stored date carry a time of day — the flag a write of it, or of a day
 * moved from it, sends with it (`taskDateTimeFlags` on the API)? No date has
 * none.
 */
export function carriesTime(iso: string | null | undefined, hasTime?: boolean): boolean {
  if (!iso) return false
  const d = new Date(iso)
  return !Number.isNaN(d.getTime()) && !isDateOnly(d, hasTime)
}

/** `YYYY-MM-DD`, for an `<input type="date">`. `hasTime`: the task's flag for this date, where the caller has it. */
export function toDateInput(iso: string | null | undefined, hasTime?: boolean): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return isDateOnly(d, hasTime)
    ? `${padYear(d.getUTCFullYear())}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    : `${padYear(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** `YYYY-MM-DDTHH:mm`, for an `<input type="datetime-local">`. `hasTime`: the task's flag for this date. */
export function toDateTimeInput(iso: string | null | undefined, hasTime?: boolean): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return isDateOnly(d, hasTime)
    ? `${padYear(d.getUTCFullYear())}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T00:00`
    : `${padYear(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * What an `<input type="datetime-local">` hands back, as an instant.
 *
 * The value has no zone on it, which is the whole point: `2026-09-15T17:30`
 * means half past five where the person typing it is sitting. `new Date` reads
 * a bare datetime as local, so this is exactly that instant — not the same
 * clock face somewhere else.
 */
export function fromDateTimeInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** A date as a write sends it: the instant, and whether it carries a time of day. */
export type DateWrite = { iso: string; hasTime: boolean }

/**
 * What the task sheet's `<input type="datetime-local">` writes, with its time
 * flag (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`): the typed clock
 * in local terms, a time — 17:00 in Los Angeles is UTC midnight, and is still
 * 17:00. Save where the date it changes carried no time and the clock reads
 * 00:00, which is how the box shows a date with no time (`toDateTimeInput`):
 * then a new day is still a date with no time, as a day picked in a day box is.
 */
export function fromDateTimeBox(value: string, stored?: string | null, storedHasTime?: boolean): DateWrite | null {
  const iso = fromDateTimeInput(value)
  if (!iso) return null
  const [day, clock] = value.split('T')
  if (clock?.startsWith('00:00') && !carriesTime(stored, storedHasTime)) {
    const [y, m, d] = day.split('-').map(Number)
    return { iso: utcMidnight(y, m - 1, d).toISOString(), hasTime: false }
  }
  return { iso, hasTime: true }
}

/**
 * A typed `datetime-local` value as the fields a new task's write sends — the
 * date and whether it carries a time (`fromDateTimeBox`) — or none for no date.
 */
export function dateWriteOf(key: 'startDate' | 'dueDate', typed: string): Record<string, string | boolean> {
  const write = typed ? fromDateTimeBox(typed) : null
  return write ? { [key]: write.iso, [`${key}HasTime`]: write.hasTime } : {}
}

/**
 * Move a date to a new day and leave its time of day where it was.
 *
 * For the pickers that are still date-only on purpose — a due date nudged from
 * a list row or a subtask line, where a full datetime control would be three
 * times the size of the row it lives in. Those are allowed to be coarse; they
 * are not allowed to destroy something they cannot show.
 */
export function withDatePart(existing: string | null | undefined, ymd: string, hasTime?: boolean): string | null {
  if (!ymd) return null
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return null

  const prev = existing ? new Date(existing) : null
  const carry = prev && carriesTime(existing, hasTime)
  // A day that never carried a time keeps being stored the way it always was,
  // so a date-only row stays byte-identical rather than acquiring an offset.
  if (!carry) return utcMidnight(y, m - 1, d).toISOString()
  return localAt(y, m - 1, d, prev!.getHours(), prev!.getMinutes()).toISOString()
}

/**
 * The calendar day a stored date is SHOWN as, by `isDateOnly`'s rule — a
 * date-only value as the day it was picked, a timed one as its local day — as
 * that day's local midnight, which is where a Gantt's day columns begin.
 *
 * `found-5-oct/timeline-press-moves-dates`: the list's Gantt and the workspace
 * timeline drew `startOfDay(new Date(iso))`, the LOCAL day of the instant, so
 * in Los Angeles every date-only bar sat a day early ("Oct 18 – Oct 20" for a
 * task of the 19th to the 21st) and a drag moved it from the wrong day.
 */
export function shownDay(iso: string | null | undefined, hasTime?: boolean): Date | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  return isDateOnly(at, hasTime)
    ? localAt(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())
    : localAt(at.getFullYear(), at.getMonth(), at.getDate())
}

/**
 * A stored date moved by whole days, as a drag moves it
 * (`found-5-oct/timeline-press-moves-dates`): `days` days on from the day it is
 * shown as, at the time of day it carried — what `withDatePart` does with a day
 * picked that many days later — or, a date with no time, the same date-only
 * form on the new day. Nought days is the date as it was.
 *
 * The timeline saved `startOfDay` of each moved date and the list's Gantt sent
 * `yyyy-MM-dd`, so a drag of a task due at 17:30 left it due at midnight.
 */
export function shiftByDays(iso: string | null | undefined, days: number, hasTime?: boolean): string | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  if (isDateOnly(at, hasTime)) at.setUTCDate(at.getUTCDate() + days)
  else at.setDate(at.getDate() + days)
  return at.toISOString()
}

/** A local calendar day (a `shownDay`) as a date with no time, the form a date-only pick stores. */
export function dayAsDateOnly(day: Date): string {
  return utcMidnight(day.getFullYear(), day.getMonth(), day.getDate()).toISOString()
}

/**
 * §G15 [22:59] / frame G15 #9 — "Today / Tomorrow / This weekend / Next week /
 * 2 weeks / 4 weeks" beside the date, rather than a bare calendar.
 *
 * Setting "due next week" was four clicks and a mental date calculation. These
 * are the six ClickUp offers, because the walkthrough is the specification: the
 * point of the exercise is that somebody moving over finds what they reach for.
 *
 * Every preset keeps the time already on the row. A deadline of 17:30 nudged to
 * "next week" is still due at 17:30 — losing it would be the same silent
 * overwrite the date fields themselves used to do.
 */
export type DatePresetId = 'today' | 'tomorrow' | 'thisWeekend' | 'nextWeek' | 'twoWeeks' | 'fourWeeks'

export const DATE_PRESETS: ReadonlyArray<{ id: DatePresetId; labelKey: string }> = [
  { id: 'today', labelKey: 'taskDetail.datePreset.today' },
  { id: 'tomorrow', labelKey: 'taskDetail.datePreset.tomorrow' },
  { id: 'thisWeekend', labelKey: 'taskDetail.datePreset.thisWeekend' },
  { id: 'nextWeek', labelKey: 'taskDetail.datePreset.nextWeek' },
  { id: 'twoWeeks', labelKey: 'taskDetail.datePreset.twoWeeks' },
  { id: 'fourWeeks', labelKey: 'taskDetail.datePreset.fourWeeks' },
]

/**
 * The instant a preset means, carrying over the time already set.
 *
 * @param existing what the field holds now, so 17:30 survives the move
 * @param now      injectable, because a function that reads the clock itself
 *                 can only be tested on the day it happens to be
 */
export function presetToIso(
  id: DatePresetId,
  existing: string | null | undefined,
  now: Date = new Date(),
  /** The task's flag for `existing`, where the caller has it. */
  hasTime?: boolean,
): string {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (id) {
    case 'today':
      break
    case 'tomorrow':
      base.setDate(base.getDate() + 1)
      break
    case 'thisWeekend': {
      // The coming Saturday. On a Saturday that is today; on a Sunday the
      // weekend you are in has one day left, so "this weekend" is today too —
      // pointing at yesterday would be the only clearly wrong answer.
      const day = base.getDay()
      if (day !== 0 && day !== 6) base.setDate(base.getDate() + (6 - day))
      break
    }
    case 'nextWeek':
      base.setDate(base.getDate() + 7)
      break
    case 'twoWeeks':
      base.setDate(base.getDate() + 14)
      break
    case 'fourWeeks':
      base.setDate(base.getDate() + 28)
      break
  }
  const prev = existing ? new Date(existing) : null
  const carry = prev && carriesTime(existing, hasTime)
  if (carry) {
    base.setHours(prev!.getHours(), prev!.getMinutes(), 0, 0)
    return base.toISOString()
  }
  // No time to carry: keep the date-only convention the rest of this module
  // uses, so a preset does not quietly give every task a 00:00 local stamp.
  return new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate())).toISOString()
}
