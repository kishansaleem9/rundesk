/**
 * §V2-07 — "Date format" and "Time format" in the export panel.
 *
 * Frame `10:58` shows both, as selects reading `Normal ▾`. She never opens
 * either one, so the video says what the DEFAULT is called and nothing about
 * what else is in the list. The option set below is therefore Rundesk's
 * choice, not a reading of the frame — the frame is the reason the controls
 * exist and the reason the default is called Normal.
 *
 * What the choice is FOR is the part that is not a guess. `2026-08-07` and
 * `08/07/2026` and `07/08/2026` are the same day, and the last two disagree
 * about which is the month. A spreadsheet opened in a different locale will
 * reinterpret an ambiguous date column silently — so the person exporting has
 * to be able to say which one they meant.
 *
 * EVERYTHING IS RENDERED IN UTC. The alternative is the server's timezone,
 * which is a property of where the API happens to run and would make the same
 * export differ between two deployments of the same product. UTC is stated in
 * the panel rather than assumed.
 */

export const DATE_FORMATS = ['normal', 'iso', 'us', 'eu'] as const
export const TIME_FORMATS = ['normal', 'h24', 'none'] as const

export type DateFormat = (typeof DATE_FORMATS)[number]
export type TimeFormat = (typeof TIME_FORMATS)[number]

export function asDateFormat(value: unknown): DateFormat {
  return DATE_FORMATS.includes(value as DateFormat) ? (value as DateFormat) : 'normal'
}

export function asTimeFormat(value: unknown): TimeFormat {
  return TIME_FORMATS.includes(value as TimeFormat) ? (value as TimeFormat) : 'normal'
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = (n: number) => String(n).padStart(2, '0')

function datePart(d: Date, format: DateFormat): string {
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const day = d.getUTCDate()
  switch (format) {
    case 'iso':
      return `${y}-${pad(m + 1)}-${pad(day)}`
    case 'us':
      return `${pad(m + 1)}/${pad(day)}/${y}`
    case 'eu':
      return `${pad(day)}/${pad(m + 1)}/${y}`
    default:
      // Unambiguous by construction: a written month cannot be read as a day.
      return `${day} ${MONTHS[m]} ${y}`
  }
}

function timePart(d: Date, format: TimeFormat): string {
  if (format === 'none') return ''
  const h = d.getUTCHours()
  const min = pad(d.getUTCMinutes())
  if (format === 'h24') return `${pad(h)}:${min}`
  const suffix = h < 12 ? 'am' : 'pm'
  const twelve = h % 12 === 0 ? 12 : h % 12
  return `${twelve}:${min} ${suffix}`
}

/**
 * `null` for a date that is not set, so the cell is empty rather than carrying
 * the word "null" or the epoch — both of which a spreadsheet would happily sort
 * as if they were real dates.
 */
export function formatDate(
  value: unknown,
  dateFormat: DateFormat,
  timeFormat: TimeFormat,
): string | null {
  if (value == null || value === '') return null
  const d = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(d.getTime())) return String(value)
  const time = timePart(d, timeFormat)
  return time ? `${datePart(d, dateFormat)} ${time}` : datePart(d, dateFormat)
}
