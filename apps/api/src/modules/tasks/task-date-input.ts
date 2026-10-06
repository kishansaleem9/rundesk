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
