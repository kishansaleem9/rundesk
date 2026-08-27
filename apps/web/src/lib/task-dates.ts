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
