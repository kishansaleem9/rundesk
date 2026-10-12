/**
 * Pointer travel (px) before a press on a Gantt bar is a drag rather than a
 * press: on the list's Gantt, where a press opens the task, and on the
 * workspace timeline, where a press moves nothing
 * (`found-5-oct/timeline-press-moves-dates`).
 */
export const GANTT_DRAG_THRESHOLD = 4

/**
 * A task as the schedule reads it: the days it is drawn on, as whole-day
 * indexes from any fixed day (only differences are read), the group it is
 * drawn in, and the tasks that must finish before it.
 */
export type GanttNode = { id: string; group: string; start: number; end: number; blockedBy: string[] }

export type GanttSchedule = {
  /** On the critical path: drawn in red when the path is shown. */
  critical: Set<string>
  /** Whole days each task may slip before it moves another — 0 on the path. */
  slack: Map<string, number>
}

/**
 * THE CRITICAL PATH AND SLACK TIME, AS CLICKUP DRAWS THEM
 * (`resume-defects/resume-5`; help centre, "Critical Path and Slack Time",
 * read through search excerpts, 12 October):
 *
 *   · "The last task in the group is responsible for the entire group's
 *     completion date, so it will always be highlighted" — each group's task
 *     that ends last is on the path, a dependency or none;
 *   · "If the last task in the critical path is dependent on another task, and
 *     there is no time gap in between them, each of the tasks will be added to
 *     the path" — a blocker joins when the task it blocks starts the day after
 *     it ends, or sooner, and the walk goes on from it;
 *   · tasks off the path show the slack time they have: the days they can slip
 *     before the first task waiting on them would have to move, or before the
 *     end of their group when nothing waits on them.
 *
 * This replaced "the longest chain of durations", which marked a chain red
 * however far it finished from the end, and never the last task alone.
 */
export function ganttSchedule(nodes: GanttNode[]): GanttSchedule {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  // Blocker → the tasks waiting on it, among the drawn tasks only.
  const waitingOn = new Map<string, string[]>()
  for (const n of nodes) {
    for (const b of n.blockedBy) {
      if (!byId.has(b) || b === n.id) continue
      const list = waitingOn.get(b) ?? []
      list.push(n.id)
      waitingOn.set(b, list)
    }
  }
  const groupEnd = new Map<string, number>()
  for (const n of nodes) groupEnd.set(n.group, Math.max(groupEnd.get(n.group) ?? Number.NEGATIVE_INFINITY, n.end))

  const critical = new Set<string>()
  const walk: string[] = nodes.filter((n) => n.end === groupEnd.get(n.group)).map((n) => n.id)
  // Each task is walked from once, so a cycle of dependencies ends the walk.
  while (walk.length > 0) {
    const id = walk.pop()!
    if (critical.has(id)) continue
    critical.add(id)
    const node = byId.get(id)!
    for (const b of node.blockedBy) {
      const blocker = byId.get(b)
      if (!blocker || critical.has(b)) continue
      if (node.start - blocker.end <= 1) walk.push(b)
    }
  }

  const slack = new Map<string, number>()
  for (const n of nodes) {
    if (critical.has(n.id)) {
      slack.set(n.id, 0)
      continue
    }
    const waiting = waitingOn.get(n.id) ?? []
    const latest =
      waiting.length > 0 ? Math.min(...waiting.map((w) => byId.get(w)!.start - 1)) : groupEnd.get(n.group)!
    slack.set(n.id, Math.max(0, latest - n.end))
  }
  return { critical, slack }
}
