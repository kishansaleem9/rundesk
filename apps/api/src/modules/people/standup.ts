/**
 * §G05 [05:40] — "✦ Get StandUp", on a person's profile.
 *
 * The frames show a button beside the message icon in the profile header, and
 * what it answers is the question a standup answers: what has this person been
 * doing, what are they on now, and what is in their way. Rundesk had the
 * ingredients — a daily briefing about YOURSELF, and per-member contribution
 * analytics buried in reports — and nothing that would tell you about SOMEBODY
 * ELSE on demand, which is the whole point of the control being on their
 * profile rather than on your own.
 *
 * Pure and separate from the service on purpose. Everything below is a
 * function of the rows handed to it, so what the text says for a person with
 * nothing to report, or with one overdue task and no finished work, is settled
 * by a unit test rather than by getting a database into that shape.
 */

/** One task, reduced to what a standup line needs to say about it. */
export interface StandupTask {
  id: string
  title: string
  /** Null when the task has no due date, which is the common case. */
  dueDate: Date | null
  completedAt: Date | null
}

export interface StandupData {
  displayName: string
  /** How many days back the window reaches. */
  days: number
  /** Closed inside the window. */
  done: StandupTask[]
  /** Open, and touched inside the window. */
  active: StandupTask[]
  /** Open and past due, whether or not it was touched. */
  overdue: StandupTask[]
  /** Open, and waiting on another task that is also still open. */
  blocked: StandupTask[]
}

/** The most a single clause will name before it starts counting instead. */
const MAX_NAMED = 3

/** Join task titles into a readable clause, capped so a line stays a line. */
export function standupList(tasks: StandupTask[], max = MAX_NAMED): string {
  const shown = tasks.slice(0, max)
  const extra = tasks.length - shown.length
  const joined = shown.map((t) => `“${t.title}”`).join(', ')
  return extra > 0 ? `${joined} (+${extra} more)` : joined
}

/** Whether there is anything at all worth saying about this person. */
export function standupHasContent(data: StandupData): boolean {
  return (
    data.done.length > 0 || data.active.length > 0 || data.overdue.length > 0 || data.blocked.length > 0
  )
}

/**
 * The standup, written from the rows alone.
 *
 * This is not a degraded mode. It is what the endpoint returns when no model
 * is configured, which is every self-hosted deployment that has not set a key
 * and every test run — so it has to be a real answer rather than a placeholder
 * apologising for one. The model, when there is one, rewrites this into
 * something warmer; it is never asked to supply a fact that is not here.
 *
 * Ordered by what a standup is for: finished work first, because that is what
 * the person wants credit for and what everyone else wants to know; then what
 * is in flight; then the two things that need somebody to act — overdue, and
 * blocked. A summary that opens with problems reads as an audit.
 */
export function formatStandupFallback(data: StandupData): string {
  const first = (data.displayName || '').trim().split(/\s+/)[0] || 'They'
  const window = data.days === 1 ? 'today' : `in the last ${data.days} days`

  if (!standupHasContent(data)) {
    // Said plainly rather than dressed up. "No recorded activity" is a fact
    // about the tasks in this workspace, not a judgement about the person, and
    // the difference matters when a manager is the one pressing the button.
    return `${first} has no recorded task activity in this workspace ${window}.`
  }

  const parts: string[] = []
  if (data.done.length) {
    parts.push(
      `finished ${data.done.length} task${data.done.length === 1 ? '' : 's'}: ${standupList(data.done)}`,
    )
  }
  if (data.active.length) {
    parts.push(`is working on ${standupList(data.active)}`)
  }

  const flags: string[] = []
  if (data.overdue.length) {
    flags.push(
      `${data.overdue.length} task${data.overdue.length === 1 ? ' is' : 's are'} overdue: ${standupList(data.overdue)}`,
    )
  }
  if (data.blocked.length) {
    flags.push(
      `${data.blocked.length} ${data.blocked.length === 1 ? 'is' : 'are'} blocked by unfinished work: ${standupList(data.blocked)}`,
    )
  }

  // Reachable with no `parts` at all: somebody whose only open task is overdue
  // has nothing finished and nothing in flight, and saying so is the point.
  const opener = parts.length
    ? `${first} ${parts.join(', and ')} ${window}.`
    : `${first} has nothing finished or in flight ${window}.`
  return flags.length ? `${opener} ${flags.join('. ')}.` : opener
}
