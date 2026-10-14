/**
 * §2.3 date rules.
 *
 * Accepted regardless of the chosen format: ISO 8601, Unix ms, and the long
 * written form ("Wednesday, December 31st 2025[, 3:30:00 pm +00:00]", which is
 * also how ClickUp's export writes its `… Text` columns). The chosen format
 * only decides SHORT dates, where 03/04/2025 means two different days.
 * Abbreviated month names are rejected, as ClickUp rejects them.
 *
 * A date with no offset is read as UTC, so the same file imports to the same
 * instant on every server.
 */

export type DateFormatKey = 'ymd' | 'dmy' | 'mdy' | 'ymd_slash'

/** §2.2 "CHOOSE THE FORMAT OF YOUR DATES." — exact labels, default first. */
export const DATE_FORMAT_OPTIONS: ReadonlyArray<{ value: DateFormatKey; label: string }> = [
  { value: 'ymd', label: 'Year-Month-Day' },
  { value: 'dmy', label: 'Day/Month/Year' },
  { value: 'mdy', label: 'Month/Day/Year' },
  { value: 'ymd_slash', label: 'Year/Month/Day' },
]

export type ParsedDate = { ok: true; ms: number; hasTime: boolean } | { ok: false; message: string }

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

const ISO_FULL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?$/i
const UNIX_MS = /^-?\d{11,14}$/
const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i
const LONG =
  /^(?:[a-z]+,\s*)?([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?(?:\s*([+-]\d{2}):?(\d{2}))?)?$/i

const SHORT: Record<DateFormatKey, RegExp> = {
  ymd: /^(\d{4}|\d{2})-(\d{1,2})-(\d{1,2})$/,
  dmy: /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/,
  mdy: /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/,
  ymd_slash: /^(\d{4}|\d{2})\/(\d{1,2})\/(\d{1,2})$/,
}

const EXAMPLE: Record<DateFormatKey, string> = {
  ymd: '2025-12-31',
  dmy: '31/12/2025',
  mdy: '12/31/2025',
  ymd_slash: '2025/12/31',
}

const fullYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y))

function utc(y: number, m: number, d: number, h = 0, min = 0, s = 0): number | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || min > 59 || s > 59) return null
  const ms = Date.UTC(y, m - 1, d, h, min, s)
  // 31/02 rolls into March in Date.UTC; a date that moved is not a date.
  const back = new Date(ms)
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null
  return ms
}

/** `13:30` is 24-hour; an am/pm suffix switches to 12-hour. */
function readTime(text: string): { h: number; m: number; s: number } | null {
  const t = TIME.exec(text.trim())
  if (!t) return null
  let h = Number(t[1])
  const suffix = t[4]?.toLowerCase()
  if (suffix) {
    if (h < 1 || h > 12) return null
    if (suffix === 'pm' && h !== 12) h += 12
    if (suffix === 'am' && h === 12) h = 0
  }
  return { h, m: Number(t[2]), s: Number(t[3] ?? 0) }
}

export function parseImportDate(raw: string, format: DateFormatKey): ParsedDate {
  const value = raw.trim()
  if (ISO_FULL.test(value)) {
    const ms = Date.parse(value.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`)
    if (!Number.isNaN(ms)) return { ok: true, ms, hasTime: true }
  }
  if (UNIX_MS.test(value)) return { ok: true, ms: Number(value), hasTime: true }

  const long = LONG.exec(value)
  if (long) {
    const month = MONTHS.indexOf(long[1].toLowerCase())
    if (month < 0) {
      return { ok: false, message: `"${value}" uses an abbreviated or unknown month. Write the month in full.` }
    }
    let h = 0
    let min = 0
    let s = 0
    if (long[4] !== undefined) {
      const time = readTime(`${long[4]}:${long[5]}${long[6] ? `:${long[6]}` : ''}${long[7] ? ` ${long[7]}` : ''}`)
      if (!time) return { ok: false, message: `"${value}" has a time that cannot be read.` }
      ;({ h, m: min, s } = time)
    }
    const base = utc(Number(long[3]), month + 1, Number(long[2]), h, min, s)
    if (base === null) return { ok: false, message: `"${value}" is not a real date.` }
    const offsetMin = long[8]
      ? (long[8].startsWith('-') ? -1 : 1) * (Math.abs(Number(long[8])) * 60 + Number(long[9]))
      : 0
    return { ok: true, ms: base - offsetMin * 60_000, hasTime: long[4] !== undefined }
  }

  const [datePart, ...rest] = value.split(/\s+/)
  const timeText = rest.join(' ')
  const short = SHORT[format].exec(datePart)
  if (short) {
    let y: number, m: number, d: number
    if (format === 'dmy') [d, m, y] = [Number(short[1]), Number(short[2]), fullYear(short[3])]
    else if (format === 'mdy') [m, d, y] = [Number(short[1]), Number(short[2]), fullYear(short[3])]
    else [y, m, d] = [fullYear(short[1]), Number(short[2]), Number(short[3])]
    const time = timeText ? readTime(timeText) : { h: 0, m: 0, s: 0 }
    if (!time) return { ok: false, message: `"${value}" has a time that cannot be read.` }
    const ms = utc(y, m, d, time.h, time.m, time.s)
    if (ms === null) return { ok: false, message: `"${value}" is not a real date.` }
    return { ok: true, ms, hasTime: Boolean(timeText) }
  }

  const fmt = DATE_FORMAT_OPTIONS.find((o) => o.value === format)?.label ?? format
  return { ok: false, message: `"${value}" is not a date in the ${fmt} format (e.g. ${EXAMPLE[format]}).` }
}
