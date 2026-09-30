import { BadRequestException } from '@nestjs/common'
import { isValidTimeZone } from '../../common/time/zone'

/**
 * WHAT A TASK'S DATES AND ESTIMATE MAY BE — one rule for every write that sets
 * them: `POST /tasks`, `PATCH /tasks/:id`, the bulk editor, a task made from a
 * template, a duplicate and the next occurrence of a recurring task all reach
 * `TasksService.createTask` or `updateTask`, which ask these.
 *
 * `found-30-sep/a-task-starts-after-it-is-due`. Nothing refused a start after
 * the due date: measured on lane 5, `POST /tasks` starting in ten days and due
 * in three answered 201, `PATCH` the same 200, the bulk editor changed the task,
 * and a template starting in nine days made beside a due date typed three days
 * out gave a task starting six days after it was due.
 *
 * ClickUp keeps the same rule. A task's date picker, given a start date after
 * the due date, deletes the due date: its feedback board's "Improve the
 * Start/Due date and time setting experience in Task view" (read through search
 * excerpts, the board being blocked here) says that "when you set a start date
 * that is after a due date, it deletes the due date", and asks instead for "a
 * warning" that does "not let you save". OWASP's Input Validation Cheat Sheet
 * names this very case as semantic validation: it "should enforce correctness
 * of their values in the specific business context (e.g. start date is before
 * end date …)". A write that names both dates, or one date past the other, is
 * REFUSED here with the reason, and nothing is written — no date is deleted
 * that the caller did not name. Where the other date is one the person did not
 * set (a template's), the date they set stands and the template's is left out
 * (`templateWithForm`), as ClickUp's picker keeps the date just set.
 */
export const START_AFTER_DUE = 'A task cannot start after it is due: the start date is after the due date.'

const HOUR = 3_600_000
const DAY = 24 * HOUR

/**
 * A value with no time on it: exactly UTC midnight. That is how the app writes
 * a day picked without a time (`apps/web/src/lib/task-dates.ts`, `withDatePart`
 * and the date-only pickers), and it is shown as that date wherever its reader
 * is — not as the local time UTC midnight happens to be.
 */
function isDateOnly(d: Date): boolean {
  return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0
}

/**
 * THE ZONE ITS WRITER READS A DAY IN — the `X-Time-Zone` header the web sends
 * with every write (`apps/web/src/lib/api.ts`), the browser's own IANA zone,
 * which is the zone every date in the app is shown in (`task-dates.ts`). Not
 * the profile's `timezone`: that defaults to UTC and the web does not show
 * dates in it, so a writer in Karachi with the default would be judged in UTC.
 * Anything that is not a zone this system knows is no zone (and the rule below
 * falls back to asking what every reader would see), not a refusal: a bad
 * header must not cost the write.
 */
export const WRITER_ZONE_HEADER = 'x-time-zone'

export function writerZone(header: unknown): string | undefined {
  const zone = Array.isArray(header) ? header[0] : header
  return typeof zone === 'string' && zone.length <= 64 && isValidTimeZone(zone) ? zone : undefined
}

/** The calendar day a moment falls on in `zone`, as `YYYY-MM-DD`. */
function dayIn(d: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** The day a value with no time on it names: its UTC date, as it is shown everywhere. */
function dayNamed(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * DOES THIS TASK START AFTER IT IS DUE — asked of the dates it would hold.
 *
 * Two moments are compared as moments, and two days (no time on either) as
 * days: starting on the day it is due is not starting after it. A DAY BESIDE A
 * MOMENT is compared as days, the moment read as the day it falls on WHERE ITS
 * WRITER IS (`zone`, `writerZone`): due "the 4th" with a start at 09:00 on the
 * 5th in Karachi (04:00Z on the 5th) starts after it is due there, and is
 * refused; the same instant typed in Los Angeles is 21:00 on the 4th, the day
 * it is due, and is taken. That is the order the writer sees in the sheet, the
 * list and the calendar, whichever of them sent it — a review of this work
 * found the web asked the exact question only in the create modal, so a day
 * beside a moment could sit up to a day and a half out of order, silently,
 * from everywhere else.
 *
 * With NO ZONE (an API caller that names none; a copy or a recurrence, whose
 * dates nobody typed now), the server cannot know which day a moment falls on,
 * and "the 5th" runs from 14 hours before that UTC midnight (UTC+14) to 12
 * hours after the day ends (UTC−12). The start is after the due then only when
 * the EARLIEST it can be is after the LATEST the due can be — never refused
 * where some reader would see the two in order.
 */
export function startsAfterDue(
  start: Date | null | undefined,
  due: Date | null | undefined,
  zone?: string | null,
): boolean {
  if (!start || !due) return false
  const s = start.getTime()
  const d = due.getTime()
  if (!Number.isFinite(s) || !Number.isFinite(d)) return false
  const startDay = isDateOnly(start)
  const dueDay = isDateOnly(due)
  if (startDay === dueDay) return s > d
  if (zone && isValidTimeZone(zone)) {
    const startOn = startDay ? dayNamed(start) : dayIn(start, zone)
    const dueOn = dueDay ? dayNamed(due) : dayIn(due, zone)
    return startOn > dueOn
  }
  const earliestStart = startDay ? s - 14 * HOUR : s
  const latestDue = dueDay ? d + DAY + 12 * HOUR : d
  return earliestStart > latestDue
}

/** Refuse (400) a task that would start after it is due — where its writer is, when `zone` says. */
export function assertDatesInOrder(
  start: Date | null | undefined,
  due: Date | null | undefined,
  zone?: string | null,
): void {
  if (startsAfterDue(start, due, zone)) throw new BadRequestException(START_AFTER_DUE)
}

/**
 * `found-30-sep/task-estimate-below-zero`. The largest estimate the column
 * holds (`time_estimate integer`, seconds): past it Postgres refuses the write,
 * and the refusal came back in its words rather than the field's.
 */
export const ESTIMATE_MAX_SECONDS = 2_147_483_647

export const ESTIMATE_RULE = `timeEstimate must be a whole number of seconds from 0 to ${ESTIMATE_MAX_SECONDS}, or null`

/**
 * WHAT AN ESTIMATE MAY BE: none (null or absent), or a whole number of seconds,
 * nought or more. `POST /tasks` took one below zero (its DTO asked `@IsInt()`
 * alone) and `PATCH /tasks/:id` asked only that it was a number, so -3600 was
 * stored and summed into every total that reads it; the template's route
 * refused it (`InstantiateTemplateDto`, `@Min(0)`) and a template's own payload
 * clamps it to nought. ClickUp's API says the same of its time estimates: the
 * time "must be a non-negative integer" ("Replace task time estimates",
 * developer.clickup.com, read through search excerpts). Refused here, by
 * every route that sets one, before anything is written.
 */
export function assertEstimate(value: unknown): void {
  if (value === null || value === undefined) return
  if (breaksEstimateRule(value)) throw new BadRequestException(ESTIMATE_RULE)
}

function breaksEstimateRule(value: unknown): boolean {
  return typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > ESTIMATE_MAX_SECONDS
}

/**
 * AN ESTIMATE CARRIED ONTO A NEW TASK FROM A ROW OR A TEMPLATE — a duplicate
 * and each of its subtasks, a template's subtasks, the next occurrence of a
 * recurring task. Rows written before the rule may hold one below nought
 * (measured: `PATCH` -60 and `POST` -3600 were taken), and `createTask` now
 * refuses those. A copy is not the place to refuse them: the duplicate had
 * already made the parent, its checklists and its values when its first
 * subtask was refused, so it failed with a half-made copy left in the list —
 * one more at each try (found by a review of this work). The copy carries
 * none instead, as the parent's copy already did.
 */
export function carriedEstimate(value: unknown): number | undefined {
  return value === null || value === undefined || breaksEstimateRule(value) ? undefined : (value as number)
}

/**
 * `found-30-sep/refused-create-leaves-tags` — tags a task is made with BY NAME,
 * as the create modal types them and a template holds them: each found in the
 * task's workspace whatever its case, as `POST /workspaces/:ws/labels` finds
 * one (`LabelsService.create`), or else made there — and made only once the
 * task is (`TasksService.createTask`). Names are trimmed, blanks dropped, and
 * each kept once, the first spelling winning.
 */
export interface LabelByName {
  name: string
  color?: string
}

/** The neutral colour a tag made without one gets, as a template's always did. */
export const DEFAULT_LABEL_COLOR = '#94a3b8'

export function uniqueLabelNames(labels: ReadonlyArray<LabelByName> | null | undefined): LabelByName[] {
  const seen = new Set<string>()
  const out: LabelByName[] = []
  for (const l of labels ?? []) {
    const name = typeof l?.name === 'string' ? l.name.trim() : ''
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, color: typeof l.color === 'string' && l.color.trim() ? l.color.trim() : DEFAULT_LABEL_COLOR })
  }
  return out
}

/**
 * Which of the names the workspace already holds (their ids), and which would
 * have to be made. A GUEST MAKES NONE: guests "can't create, edit, or delete
 * tags" in ClickUp, and `POST /workspaces/:ws/labels` refuses them (403,
 * `LabelsService.assertNotGuest`), so a name a guest types that is not a tag
 * yet is left off the task rather than made — a tag that cannot be made must
 * not cost the task, the create modal's own rule.
 */
export function planLabelsByName(
  wanted: ReadonlyArray<LabelByName>,
  existing: ReadonlyArray<{ id: string; name: string }>,
  { mayMake }: { mayMake: boolean },
): { foundIds: string[]; toMake: LabelByName[] } {
  const byLower = new Map<string, string>()
  for (const l of existing) if (!byLower.has(l.name.toLowerCase())) byLower.set(l.name.toLowerCase(), l.id)
  const foundIds: string[] = []
  const toMake: LabelByName[] = []
  for (const l of wanted) {
    const id = byLower.get(l.name.toLowerCase())
    if (id) foundIds.push(id)
    else if (mayMake) toMake.push(l)
  }
  return { foundIds, toMake }
}
