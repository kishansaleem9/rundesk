import { BadRequestException } from '@nestjs/common'

/**
 * A TASK'S START OR DUE DATE AS A WRITE SENDS IT — the instant, nothing for an
 * empty value, or a 400 that says why it cannot be written
 * (`found-5-oct/years-below-100-read-back-wrong`).
 *
 * The date reaches Postgres as the ISO text `toISOString()` makes of it, whose
 * year has four digits: 0001 to 9999. Year 0 (`0000-…`, which Postgres does not
 * have), a year before it (`-000001-…`) and a year past 9999 (`+010000-…`) were
 * sent anyway, and Postgres refused them: `PATCH /tasks/:id` and `POST /tasks`
 * answered 500 "Internal server error", and the bulk editor named the database's
 * own error for each task. Measured on lane 5, 6 October. Nothing that was
 * written before is refused now — those writes all failed — they are refused
 * before anything is written, in words. Every year from 1 to 9999 is written
 * and read back as sent (`@rundesk/db`'s `readTimestamptzText`).
 */
export const TASK_DATE_YEARS = { first: 1, last: 9999 } as const

export function taskDateFrom(label: string, value: unknown): Date | null {
  if (!value) return null
  const at = new Date(value as string)
  if (Number.isNaN(at.getTime())) throw new BadRequestException(`${label} is not a valid date`)
  const year = at.getUTCFullYear()
  if (year < TASK_DATE_YEARS.first || year > TASK_DATE_YEARS.last) {
    throw new BadRequestException(
      `${label} must fall between the years ${TASK_DATE_YEARS.first} and ${TASK_DATE_YEARS.last}`,
    )
  }
  return at
}

/**
 * WHETHER A TASK'S DATES CARRY A TIME OF DAY, AS A WRITE LEAVES THEM
 * (`found-6-oct/a-time-on-utc-midnight-reads-as-no-time`).
 *
 * A date picked without a time is stored at UTC midnight, and the app read every
 * UTC midnight as such a date. A real time can be UTC midnight as well — 17:00
 * in Los Angeles in October, 05:00 in Karachi — and, typed in the task sheet and
 * saved, it came back as a date with no time (lane 5, 6 October). ClickUp's API
 * keeps a flag beside each date, `start_date_time` and `due_date_time`, "true if
 * the date includes a time of day"; so does `tasks` (migration 0174).
 *
 * Each date a write sets takes the flag sent with it, or — none sent — the one
 * its instant says, as the app read it until now: no date, no time; a UTC
 * midnight, a date with no time; anything else, a time. A flag sent without its
 * date says whether the date the task holds carries a time. Dates the write does
 * not set keep their flags: their keys are left out.
 */
export type TaskDateTimeFlags = { startDateHasTime?: boolean; dueDateHasTime?: boolean }

/** Is this instant exactly UTC midnight — the form a date picked without a time is stored in? */
export function isUtcMidnight(at: Date): boolean {
  return at.getUTCHours() === 0 && at.getUTCMinutes() === 0 && at.getUTCSeconds() === 0
}

export function taskDateTimeFlags(write: {
  startDate?: Date | null
  dueDate?: Date | null
  startDateHasTime?: boolean
  dueDateHasTime?: boolean
}): TaskDateTimeFlags {
  const flag = (date: Date | null | undefined, sent: boolean | undefined): boolean | undefined => {
    if (date === undefined) return sent
    if (date === null) return false
    return sent ?? !isUtcMidnight(date)
  }
  const out: TaskDateTimeFlags = {}
  const start = flag(write.startDate, write.startDateHasTime)
  const due = flag(write.dueDate, write.dueDateHasTime)
  if (start !== undefined) out.startDateHasTime = start
  if (due !== undefined) out.dueDateHasTime = due
  return out
}

/** A time flag as a body sends it: true, false, or not sent; anything else is refused in words. */
export function taskTimeFlagFrom(label: string, value: unknown): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new BadRequestException(`${label} must be true or false`)
  return value
}
