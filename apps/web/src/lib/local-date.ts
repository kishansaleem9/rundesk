/**
 * A day and a time as the READER'S CLOCK has them.
 *
 * `toISOString()` is UTC. A local midnight east of Greenwich is the previous day
 * in UTC, so `d.toISOString().slice(0, 10)` labels a day with the date before
 * it, and `.slice(0, 16)` fills a `datetime-local` box with the UTC wall clock,
 * which the box then saves as local time. The planner found and fixed this for
 * its own columns; the workload CSV and the AI page's meeting card still had it
 * (`product-siblings/workload-csv-dates-shifted-east-of-utc`,
 * `product-siblings/meeting-record-panel-startsat-utc-shift`). In Asia/Karachi,
 * the walkthrough's own zone, every column was a day early and every
 * open-and-save moved a meeting five hours. Three exports named their files the
 * same way, so a file saved before 05:00 there was dated the day before.
 *
 * Three reminder and booking boxes had it right, each by shifting the instant
 * by its offset before `toISOString()`: the same rule written three times. They
 * read it from here now, so there is one statement of it to get wrong.
 */
const pad = (n: number) => String(n).padStart(2, '0')

/** A day, as `YYYY-MM-DD`, in local time. */
export const localDayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** A local wall-clock time as a `datetime-local` box holds it: `YYYY-MM-DDTHH:mm`. */
export const localDateTimeValue = (d: Date) => `${localDayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
