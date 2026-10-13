/**
 * HOW ONE ASSIGNED TASK LOADS A PERSON'S DAYS — the one rule every workload
 * reader uses: the workspace Workload page, its day drill-down and a list's
 * Workload view (`commit-log/log-68bc188-1`, `ledger-rows/row-777`).
 *
 * As ClickUp's Workload counts it (help centre, "Measure your workload" and
 * "Use Workload view", read through search excerpts, 13 October):
 *
 *   · Time estimates are spread evenly over the task's days, start to due. A
 *     task with only one of the two dates sits on that one day.
 *   · Tasks counts a task on EVERY day of its span: a five-day task is one
 *     task on each of five days, not a fifth of one.
 *   · Sprint points spread like an estimate.
 *   · A task with no date is UNSCHEDULED and loads nobody: it is listed, not
 *     counted. A task with no estimate adds nothing under Time estimates and
 *     is listed as having none — it is not given four hours it never had.
 *
 * The share is taken over the WHOLE span, then only the days inside the window
 * are kept, so a fortnight-long task does not pile its fortnight onto the five
 * days of it a one-week window happens to show.
 */

export type WorkloadMeasure = 'hours' | 'tasks' | 'points'
export const WORKLOAD_MEASURES: readonly WorkloadMeasure[] = ['hours', 'tasks', 'points']

export type SpreadTask = {
  startDate: Date | string | null
  dueDate: Date | string | null
  /** Seconds. */
  timeEstimate: number | null
  points?: number | null
}

const DAY_MS = 86_400_000

/** Local midnight of a date. */
export function dayStart(value: Date | string): Date {
  const next = new Date(value)
  next.setHours(0, 0, 0, 0)
  return next
}

/** Whole days from `a` to `b`, by the calendar, so a clock change does not lose one. */
function daysBetween(a: Date, b: Date): number {
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS)
}

/** The task's days, or null when it has neither date — unscheduled. */
export function spanOf(task: Pick<SpreadTask, 'startDate' | 'dueDate'>): { from: Date; to: Date } | null {
  const s = task.startDate ? dayStart(task.startDate) : null
  const d = task.dueDate ? dayStart(task.dueDate) : null
  if (!s && !d) return null
  const a = s ?? d!
  const b = d ?? s!
  return a <= b ? { from: a, to: b } : { from: b, to: a }
}

/** Whether a task counts under this measure at all (beyond having a date). */
export function measured(task: SpreadTask, measure: WorkloadMeasure): boolean {
  if (measure === 'hours') return (task.timeEstimate ?? 0) > 0
  if (measure === 'points') return (task.points ?? 0) > 0
  return true
}

/**
 * The task's load on each day of the window `[start, start + days)`, as an
 * array of `days` numbers. All zeros for a task that is unscheduled, not
 * measured, or outside the window.
 */
export function spread(task: SpreadTask, start: Date, days: number, measure: WorkloadMeasure): number[] {
  const out = Array.from({ length: days }, () => 0)
  const span = spanOf(task)
  if (!span || !measured(task, measure)) return out
  const length = daysBetween(span.from, span.to) + 1
  const share =
    measure === 'tasks'
      ? 1
      : measure === 'points'
        ? (task.points ?? 0) / length
        : Math.max(0.5, Math.round(((task.timeEstimate ?? 0) / 3600) * 10) / 10) / length
  const first = daysBetween(start, span.from)
  for (let i = Math.max(0, first); i < Math.min(days, first + length); i++) out[i] += share
  return out
}
