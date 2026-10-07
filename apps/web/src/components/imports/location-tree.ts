/**
 * The Space → Folder → Project → List tree the location pickers draw, built
 * from `GET /spaces/workspace/:id/move-targets` (the spaces this person may
 * add to). A space's hidden list container is not a row: its lists are drawn
 * under the space, as the sidebar draws them.
 */

import type { LocationType } from '../../lib/imports-exports-api'

export type MoveTargetSpace = {
  id: string
  name: string
  icon?: string | null
  color?: string | null
  folders: Array<{ id: string; name: string }>
  projects: Array<{ id: string; name: string; folderId: string | null; isDefaultContainer?: boolean }>
  lists?: Array<{ id: string; name: string; projectId: string }>
}

export type TreeNode = {
  type: LocationType
  id: string
  name: string
  depth: number
  spaceId: string
  color?: string | null
  /** "Space / Folder / Project" — what the picker shows once chosen, and what search matches. */
  path: string
  children: TreeNode[]
}

export function buildLocationTree(spaces: MoveTargetSpace[]): TreeNode[] {
  return spaces.map((s) => {
    const lists = s.lists ?? []
    const listsOf = (projectId: string, depth: number, path: string): TreeNode[] =>
      lists
        .filter((l) => l.projectId === projectId)
        .map((l) => ({ type: 'list', id: l.id, name: l.name, depth, spaceId: s.id, path: `${path} / ${l.name}`, children: [] }))
    const projectNode = (p: MoveTargetSpace['projects'][number], depth: number, path: string): TreeNode => {
      const here = `${path} / ${p.name}`
      return { type: 'project', id: p.id, name: p.name, depth, spaceId: s.id, path: here, children: listsOf(p.id, depth + 1, here) }
    }
    const visible = s.projects.filter((p) => !p.isDefaultContainer)
    const children: TreeNode[] = [
      ...s.folders.map((f) => {
        const here = `${s.name} / ${f.name}`
        return {
          type: 'folder' as const,
          id: f.id,
          name: f.name,
          depth: 1,
          spaceId: s.id,
          path: here,
          children: visible.filter((p) => p.folderId === f.id).map((p) => projectNode(p, 2, here)),
        }
      }),
      ...visible.filter((p) => !p.folderId || !s.folders.some((f) => f.id === p.folderId)).map((p) => projectNode(p, 1, s.name)),
      ...s.projects.filter((p) => p.isDefaultContainer).flatMap((p) => listsOf(p.id, 1, s.name)),
    ]
    return { type: 'space', id: s.id, name: s.name, depth: 0, spaceId: s.id, color: s.color, path: s.name, children }
  })
}

/** Depth-first rows, as drawn. */
export function flattenTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)])
}

/** "Search..." filters the tree: a match keeps its ancestors so it stays where it lives. */
export function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  const q = query.trim().toLowerCase()
  if (!q) return nodes
  return nodes.flatMap((n) => {
    if (n.name.toLowerCase().includes(q)) return [n]
    const kids = filterTree(n.children, q)
    return kids.length ? [{ ...n, children: kids }] : []
  })
}

export const nodeKey = (n: { type: LocationType; id: string }) => `${n.type}:${n.id}`

/** Every key under (and including) a node: "parent check selects children" (§5.1). */
export function descendantKeys(node: TreeNode): string[] {
  return [nodeKey(node), ...node.children.flatMap(descendantKeys)]
}

/**
 * Ticking a node ticks its whole subtree; unticking clears it, and clears the
 * ancestors that were ticked as a whole (they no longer are).
 */
export function toggleNode(selected: ReadonlySet<string>, node: TreeNode, roots: TreeNode[]): Set<string> {
  const next = new Set(selected)
  const keys = descendantKeys(node)
  const on = !selected.has(nodeKey(node))
  for (const k of keys) {
    if (on) next.add(k)
    else next.delete(k)
  }
  if (!on) {
    const clearAncestors = (nodes: TreeNode[], trail: TreeNode[]): boolean => {
      for (const n of nodes) {
        if (nodeKey(n) === nodeKey(node)) {
          for (const a of trail) next.delete(nodeKey(a))
          return true
        }
        if (clearAncestors(n.children, [...trail, n])) return true
      }
      return false
    }
    clearAncestors(roots, [])
  }
  return next
}

/**
 * What to send: the highest ticked nodes only (a ticked Space stands for all
 * of it), so the export reads the Space as the person chose it.
 */
export function selectionToLocations(selected: ReadonlySet<string>, roots: TreeNode[]): Array<{ type: LocationType; id: string }> {
  const out: Array<{ type: LocationType; id: string }> = []
  const walk = (nodes: TreeNode[]) => {
    for (const n of nodes) {
      if (selected.has(nodeKey(n))) out.push({ type: n.type, id: n.id })
      else walk(n.children)
    }
  }
  walk(roots)
  return out
}
