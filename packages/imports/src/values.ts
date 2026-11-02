/** Cell value parsers for the built-in columns (§2.3) and Custom Fields (§2.5). */

export type Priority = 'urgent' | 'high' | 'normal' | 'low'

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string }

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value })
const fail = (message: string): Parsed<never> => ({ ok: false, message })

/**
 * Multi-value cells (§2.3): split on the chosen delimiter, trim, drop empties.
 * A cell wrapped in brackets — how ClickUp's own export writes `[a,b]` — is
 * unwrapped first, so its export imports without editing.
 */
export function splitMulti(value: string, delimiter: string): string[] {
  let text = value.trim()
  if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1)
  if (!text) return []
  return text
    .split(delimiter || ',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const PRIORITY_BY_NUMBER: Record<string, Priority> = { '1': 'urgent', '2': 'high', '3': 'normal', '4': 'low' }
const PRIORITY_WORDS: readonly Priority[] = ['urgent', 'high', 'normal', 'low']

/** `1` Urgent … `4` Low (`2.0` as a spreadsheet may write it), and (a RUNDESK extension) the words themselves, any case. */
export function parsePriority(raw: string): Parsed<Priority> {
  const v = raw.trim().toLowerCase().replace(/^([1-4])\.0+$/, '$1')
  const byNumber = PRIORITY_BY_NUMBER[v]
  if (byNumber) return ok(byNumber)
  if ((PRIORITY_WORDS as readonly string[]).includes(v)) return ok(v as Priority)
  return fail(`"${raw.trim()}" is not a priority. Use 1 (Urgent), 2 (High), 3 (Normal) or 4 (Low).`)
}

const UNIT_MS: Record<string, number> = {
  w: 604_800_000, week: 604_800_000, weeks: 604_800_000,
  d: 86_400_000, day: 86_400_000, days: 86_400_000,
  h: 3_600_000, hr: 3_600_000, hrs: 3_600_000, hour: 3_600_000, hours: 3_600_000,
  m: 60_000, min: 60_000, mins: 60_000, minute: 60_000, minutes: 60_000,
  s: 1_000, sec: 1_000, secs: 1_000, second: 1_000, seconds: 1_000,
}

/**
 * A duration in milliseconds: `2h 30m`, `150m`, `2:30` (h:mm), or a bare
 * number of ms — also as a spreadsheet may write one (`900000.0`, `9.0E5`).
 */
export function parseDuration(raw: string): Parsed<number> {
  const v = raw.trim().toLowerCase()
  if (/^\d+$/.test(v)) return ok(Number(v))
  if (/^\d+\.0+$/.test(v) || /^\d+(\.\d+)?e\+?\d+$/.test(v)) {
    const n = Number(v)
    if (Number.isFinite(n) && Number.isSafeInteger(Math.round(n))) return ok(Math.round(n))
  }
  const clock = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(v)
  if (clock) {
    if (Number(clock[2]) > 59 || Number(clock[3] ?? 0) > 59) return fail(`"${raw.trim()}" is not a duration.`)
    return ok((Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3] ?? 0)) * 1000)
  }
  let total = 0
  let consumed = ''
  for (const m of v.matchAll(/(\d+(?:\.\d+)?)\s*([a-z]+)/g)) {
    const unit = UNIT_MS[m[2]]
    if (unit === undefined) return fail(`"${raw.trim()}" is not a duration.`)
    total += Number(m[1]) * unit
    consumed += m[0]
  }
  if (!consumed || consumed.replace(/\s+/g, '') !== v.replace(/\s+/g, '')) {
    return fail(`"${raw.trim()}" is not a duration. Use e.g. 2h 30m, 150m or 2:30.`)
  }
  return ok(Math.round(total))
}

/** `2h 30m` — how the export's `… Text` twin writes a duration. */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

const CHECK_TRUE = new Set(['true', 't', '1', 'checked', 'yes'])
const CHECK_FALSE = new Set(['false', 'f', '0', 'unchecked', 'no'])

export function parseCheckbox(raw: string): Parsed<boolean> {
  const v = raw.trim().toLowerCase()
  if (CHECK_TRUE.has(v)) return ok(true)
  if (CHECK_FALSE.has(v)) return ok(false)
  return fail(`"${raw.trim()}" is not a checkbox value. Use true/false, t/f, 1/0 or checked/unchecked.`)
}

export function parseNumber(raw: string): Parsed<number> {
  const v = raw.trim().replace(/,/g, '')
  const n = Number(v)
  if (v === '' || !Number.isFinite(n)) return fail(`"${raw.trim()}" is not a number.`)
  return ok(n)
}

/** `15.20`; a currency symbol or thousands separators are tolerated, the field's currency is used. */
export function parseMoney(raw: string): Parsed<number> {
  const v = raw.trim().replace(/^[^\d-]+/, '').replace(/[\s,]/g, '')
  const n = Number(v)
  if (v === '' || !Number.isFinite(n)) return fail(`"${raw.trim()}" is not an amount of money.`)
  return ok(Math.round(n * 100) / 100)
}

export function parseRating(raw: string): Parsed<number> {
  const n = Number(raw.trim())
  if (!Number.isInteger(n) || n < 1 || n > 5) return fail(`"${raw.trim()}" is not a rating from 1 to 5.`)
  return ok(n)
}

export function parseProgress(raw: string): Parsed<number> {
  const n = Number(raw.trim().replace(/%$/, ''))
  if (!Number.isFinite(n) || n < 0 || n > 100) return fail(`"${raw.trim()}" is not a progress value from 0 to 100.`)
  return ok(n)
}

export function parseEmail(raw: string): Parsed<string> {
  const v = raw.trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? ok(v) : fail(`"${v}" is not an email address.`)
}

/** Phone numbers must carry their country code: `+44 20 7946 0958`. */
export function parsePhone(raw: string): Parsed<string> {
  const v = raw.trim()
  const digits = v.replace(/\D/g, '')
  if (!/^\+[\d\s().-]+$/.test(v) || digits.length < 8 || digits.length > 15) {
    return fail(`"${v}" is not a phone number with its country code (e.g. +44 20 7946 0958).`)
  }
  return ok(v)
}

/** A website must be a full URL, scheme included. */
export function parseWebsite(raw: string): Parsed<string> {
  const v = raw.trim()
  return /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]+$/i.test(v) || /^https?:\/\/localhost(:\d+)?(\/\S*)?$/i.test(v)
    ? ok(v)
    : fail(`"${v}" is not a full website address (e.g. https://example.com).`)
}
