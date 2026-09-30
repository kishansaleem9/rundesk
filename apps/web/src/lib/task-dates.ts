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

/**
 * Is this instant exactly UTC midnight?
 *
 * Rows written before this file exists are all UTC midnight, because that is
 * what `new Date('2026-09-16')` parses to. Read literally in local time, every
 * one of them would suddenly sprout a clock — a task due "the 16th" would show
 * as 05:00 on the 16th in Karachi and 17:00 on the 15th in Los Angeles. So a
 * value with no time in it is shown as the date it was picked as, and only a
 * value that carries a real time is translated into local terms.
 *
 * The rule is stable in both directions: pick 00:00 locally and the instant
 * that gets stored is *not* UTC midnight (unless you are on UTC), so it comes
 * back through the local branch and still reads 00:00. Nothing drifts.
 */
function isDateOnly(d: Date): boolean {
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0
}

/** `YYYY-MM-DD`, for an `<input type="date">`. */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return isDateOnly(d)
    ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** `YYYY-MM-DDTHH:mm`, for an `<input type="datetime-local">`. */
export function toDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return isDateOnly(d)
    ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T00:00`
    : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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

/**
 * DOES A TASK SO DATED START AFTER IT IS DUE — two `<input type="datetime-local">`
 * values, as the person typed them, in their own zone
 * (`found-30-sep/a-task-starts-after-it-is-due`). The server refuses such a task
 * (400); the create modal asks first, so it can say so beside the dates and not
 * send a create it knows will be refused. Either box empty is never out of
 * order; nor is the same moment.
 */
export function datesOutOfOrder(start: string, due: string): boolean {
  if (!start || !due) return false
  const s = new Date(start).getTime()
  const d = new Date(due).getTime()
  return Number.isFinite(s) && Number.isFinite(d) && s > d
}

/**
 * The latest a start may be picked, as a `datetime-local` `max`: the due
 * moment, or the END of a due day that has no time on it — a task due "the
 * 5th" may start at 09:00 on the 5th. The task sheet's start box carries it, so
 * its picker offers no day after the due date.
 */
export function startMaxFor(dueIso: string | null | undefined): string | undefined {
  if (!dueIso) return undefined
  const d = new Date(dueIso)
  if (Number.isNaN(d.getTime())) return undefined
  return isDateOnly(d) ? `${toDateInput(dueIso)}T23:59` : toDateTimeInput(dueIso)
}

/**
 * Move a date to a new day and leave its time of day where it was.
 *
 * For the pickers that are still date-only on purpose — a due date nudged from
 * a list row or a subtask line, where a full datetime control would be three
 * times the size of the row it lives in. Those are allowed to be coarse; they
 * are not allowed to destroy something they cannot show.
 */
export function withDatePart(existing: string | null | undefined, ymd: string): string | null {
  if (!ymd) return null
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return null

  const prev = existing ? new Date(existing) : null
  const carry = prev && !Number.isNaN(prev.getTime()) && !isDateOnly(prev)
  const next = new Date(
    y, m - 1, d,
    carry ? prev!.getHours() : 0,
    carry ? prev!.getMinutes() : 0,
    0, 0,
  )
  // A day that never carried a time keeps being stored the way it always was,
  // so a date-only row stays byte-identical rather than acquiring an offset.
  if (!carry) return new Date(Date.UTC(y, m - 1, d)).toISOString()
  return next.toISOString()
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
  const carry = prev && !Number.isNaN(prev.getTime()) && !isDateOnly(prev)
  if (carry) {
    base.setHours(prev!.getHours(), prev!.getMinutes(), 0, 0)
    return base.toISOString()
  }
  // No time to carry: keep the date-only convention the rest of this module
  // uses, so a preset does not quietly give every task a 00:00 local stamp.
  return new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate())).toISOString()
}
