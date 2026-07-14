export type GanttNode = { id: string; durationDays: number; blockedBy: string[] }

/**
 * Ids on the critical path: the longest cumulative-duration chain through the
 * dependency graph (each edge blockedBy → this task means the blocker must
 * finish first). Returns an empty set unless the chain spans ≥2 tasks. Cycles
 * are guarded so a bad edge can't hang the computation.
 */
export function criticalPath(nodes: GanttNode[]): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const memoLen = new Map<string, number>()
  const memoPrev = new Map<string, string | null>()
  const visiting = new Set<string>()

  const longest = (id: string): number => {
    if (memoLen.has(id)) return memoLen.get(id)!
    const node = byId.get(id)
    if (!node) return 0
    if (visiting.has(id)) return node.durationDays // cycle guard
    visiting.add(id)
    let best = 0
    let bestPrev: string | null = null
    for (const b of node.blockedBy) {
      if (!byId.has(b)) continue
      const l = longest(b)
      if (l > best) {
        best = l
        bestPrev = b
      }
    }
    visiting.delete(id)
    memoLen.set(id, node.durationDays + best)
    memoPrev.set(id, bestPrev)
    return memoLen.get(id)!
  }

  // Only tasks that take part in a dependency edge can anchor the critical
  // path — a standalone task (however long) has no chain to highlight.
  const participates = new Set<string>()
  for (const n of nodes) {
    for (const b of n.blockedBy) {
      if (byId.has(b)) {
        participates.add(n.id)
        participates.add(b)
      }
    }
  }

  let endId: string | null = null
  let endLen = -1
  for (const n of nodes) {
    if (!participates.has(n.id)) continue
    const l = longest(n.id)
    if (l > endLen) {
      endLen = l
      endId = n.id
    }
  }

  const path = new Set<string>()
  let cur = endId
  let guard = 0
  while (cur && guard++ < 100000) {
    path.add(cur)
    cur = memoPrev.get(cur) ?? null
  }
  return path.size >= 2 ? path : new Set<string>()
}
