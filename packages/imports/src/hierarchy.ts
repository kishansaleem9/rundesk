/**
 * §2.3 `Task ID` / `Subtask IDs` → parent links.
 *
 * A row's `Subtask IDs` names the Task IDs of its children, to any depth in
 * the file. RUNDESK subtasks nest ONE level (the API refuses deeper, and the
 * task page offers no "Add subtask" on a subtask), so a row deeper than that
 * keeps all its own properties but becomes a subtask of its TOP-LEVEL task,
 * and the review says so on that row. Nothing in the file is lost: only the
 * extra levels are folded.
 */

export type HierarchyInput = {
  key: string
  /** For messages: the row number the person sees. */
  label: string
  taskId?: string
  subtaskIds: string[]
}

export type HierarchyIssue = {
  key: string
  column: 'taskId' | 'subtaskIds'
  severity: 'format' | 'info'
  message: string
}

export type Hierarchy = {
  /** child row key → the row it is imported under (always a top-level row). */
  parentOf: Map<string, string>
  /** child row key → how deep the file placed it (1 = a direct subtask). */
  depthOf: Map<string, number>
  issues: HierarchyIssue[]
}

export function buildHierarchy(rows: HierarchyInput[]): Hierarchy {
  const issues: HierarchyIssue[] = []
  const byId = new Map<string, HierarchyInput>()
  for (const r of rows) {
    const id = r.taskId?.trim()
    if (!id) continue
    const first = byId.get(id)
    if (first) {
      issues.push({
        key: r.key,
        column: 'taskId',
        severity: 'format',
        message: `Task ID "${id}" is already used on ${first.label}, so this row cannot be linked as a subtask.`,
      })
      continue
    }
    byId.set(id, r)
  }

  const rawParent = new Map<string, string>()
  const label = new Map(rows.map((r) => [r.key, r.label]))
  for (const r of rows) {
    for (const id of r.subtaskIds) {
      const child = byId.get(id)
      if (!child) {
        issues.push({ key: r.key, column: 'subtaskIds', severity: 'format', message: `No row has Task ID "${id}".` })
        continue
      }
      if (child.key === r.key) {
        issues.push({ key: r.key, column: 'subtaskIds', severity: 'format', message: 'A task cannot be its own subtask.' })
        continue
      }
      const existing = rawParent.get(child.key)
      if (existing && existing !== r.key) {
        issues.push({
          key: r.key,
          column: 'subtaskIds',
          severity: 'format',
          message: `Task ID "${id}" is already a subtask of ${label.get(existing)}.`,
        })
        continue
      }
      rawParent.set(child.key, r.key)
    }
  }

  // Break loops (a → b → a): the link that closes the loop is dropped.
  for (const start of rows) {
    const seen = new Set<string>([start.key])
    let at = start.key
    while (rawParent.has(at)) {
      const up = rawParent.get(at)!
      if (seen.has(up)) {
        rawParent.delete(at)
        issues.push({
          key: up,
          column: 'subtaskIds',
          severity: 'format',
          message: `Subtask IDs form a loop with ${label.get(at)}; that link is not imported.`,
        })
        break
      }
      seen.add(up)
      at = up
    }
  }

  const parentOf = new Map<string, string>()
  const depthOf = new Map<string, number>()
  for (const r of rows) {
    let depth = 0
    let root = r.key
    while (rawParent.has(root)) {
      root = rawParent.get(root)!
      depth++
    }
    if (depth === 0) continue
    parentOf.set(r.key, root)
    depthOf.set(r.key, depth)
    if (depth > 1) {
      issues.push({
        key: r.key,
        column: 'subtaskIds',
        severity: 'info',
        message: `Rundesk subtasks nest one level, so this row will be a subtask of ${label.get(root)}, its top-level task.`,
      })
    }
  }
  return { parentOf, depthOf, issues }
}

/** Top-level rows first, then subtasks, so a parent always exists before its children are written. */
export function topologicalOrder<T extends { key: string }>(rows: T[], parentOf: Map<string, string>): T[] {
  return [...rows.filter((r) => !parentOf.has(r.key)), ...rows.filter((r) => parentOf.has(r.key))]
}
