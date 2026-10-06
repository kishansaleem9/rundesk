/**
 * A `timestamp with time zone` READ BACK AS IT IS STORED
 * (`found-5-oct/years-below-100-read-back-wrong`).
 *
 * drizzle has the driver hand every timestamp over as Postgres's own text —
 * `2026-10-06 09:00:00+00` — and each column reads it with `new Date(text)`.
 * That text is not the ISO form JavaScript defines, so V8 falls back to its
 * legacy parser, which reads a year of two digits as a twentieth- or
 * twenty-first-century one. A start of `0002-10-06T09:00Z` was written as typed
 * (Postgres held `0002-10-06 09:00:00+00`) and every read answered
 * `2006-02-10T09:00Z`; `0099` came back as 1999. Measured 5 October on lane 4,
 * and again on lane 5: `PATCH /tasks/:id`, `GET /tasks/:id`, the list, the
 * timeline and `POST /tasks` all answered the other date, and the task sheet
 * showed it.
 *
 * So the driver's text is given to drizzle in a form `new Date` reads exactly:
 *
 *   · a year from 0100 to 9999, with an offset of whole minutes and no era —
 *     everything this app writes today — is passed through UNCHANGED, so a raw
 *     query's rows read as they always did;
 *   · anything else Postgres can hold — a year below 100, one past 9999, one
 *     BC, an offset with seconds (a zone's local mean time, which a session
 *     outside UTC prints for an old date) — is turned into the instant's ISO
 *     string, with the expanded year (`+010000`, `-000001`) where it needs one;
 *   · text this does not recognise (`infinity`, another DateStyle) is passed
 *     through, to be read as before.
 *
 * WHICH YEARS a task may hold is not settled here: ClickUp's documentation names
 * no range (its API takes a date as Unix milliseconds), so this refuses nothing
 * and reads back what was stored.
 */
const PG_TIMESTAMPTZ =
  /^(\d{4,})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?([+-])(\d{2})(?::(\d{2}))?(?::(\d{2}))?( BC)?$/

export function readTimestamptzText(text: string): string {
  const m = PG_TIMESTAMPTZ.exec(text)
  if (!m) return text
  const [, y, mo, d, h, mi, s, frac, sign, oh, om, os, bc] = m
  const year = Number(y)
  if (y.length === 4 && year >= 100 && os === undefined && bc === undefined) return text
  const at = new Date(0)
  // `setUTCFullYear`, never `Date.UTC(year, …)`: that one maps 0–99 to 1900–1999.
  at.setUTCFullYear(bc ? 1 - year : year, Number(mo) - 1, Number(d))
  at.setUTCHours(Number(h), Number(mi), Number(s), frac ? Number(frac.padEnd(3, '0').slice(0, 3)) : 0)
  const offsetSeconds = (sign === '-' ? -1 : 1) * (Number(oh) * 3600 + Number(om ?? 0) * 60 + Number(os ?? 0))
  const instant = at.getTime() - offsetSeconds * 1000
  // Past what a JavaScript date can hold (±275 760 years; Postgres goes to 294 276 AD):
  // left as it was, to be read as it always was.
  return Number.isNaN(new Date(instant).getTime()) ? text : new Date(instant).toISOString()
}

/** The type id of `timestamp with time zone`, whose text the driver hands to drizzle. */
export const TIMESTAMPTZ_OID = 1184
