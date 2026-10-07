/**
 * The import writer's decisions, as pure functions — which List a row goes
 * to, which status a cell names, who an assignee cell is — so they are tested
 * without a database and the writer only carries them out.
 */

import { IMPORTED_LIST_NAME, type RundeskImportBundle } from '@rundesk/imports'

/** The bundle list id every row without a `List` cell goes to. */
export const DEFAULT_LIST_SOURCE = 'list:__default'

export type ListPlan = Array<{
  sourceId: string
  name: string
  /** True for the destination List itself (nothing is created). */
  isDestination: boolean
  /** True when this list is "Imported from Spreadsheet" — always a new list, never one already there. */
  alwaysNew: boolean
}>

/**
 * §2.2: a List destination takes the rows itself; anything else gets a new
 * "Imported from Spreadsheet" List. A `List` column's values each create (or
 * use, when one of that name is already there) a List beside it.
 */
export function planLists(bundle: RundeskImportBundle, destinationIsList: boolean): ListPlan {
  const plan: ListPlan = []
  if (bundle.tasks.some((t) => !t.listSourceId)) {
    plan.push({
      sourceId: DEFAULT_LIST_SOURCE,
      name: IMPORTED_LIST_NAME,
      isDestination: destinationIsList,
      alwaysNew: !destinationIsList,
    })
  }
  for (const l of bundle.lists) {
    if (!bundle.tasks.some((t) => t.listSourceId === l.sourceId)) continue
    plan.push({ sourceId: l.sourceId, name: l.name.trim().slice(0, 200), isDestination: false, alwaysNew: false })
  }
  return plan
}

/** `Imported from Spreadsheet`, or `… (2)`, `… (3)` while a live list of that name is there. */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const names = new Set([...taken].map((n) => n.toLowerCase()))
  if (!names.has(base.toLowerCase())) return base
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} (${i})`
    if (!names.has(candidate.toLowerCase())) return candidate
  }
  return `${base} (${Date.now()})`
}

export type EffectiveStatus = { key: string; name: string; category: string; position: number }

export type StatusChoice =
  | { kind: 'existing'; key: string; category: 'open' | 'in_progress' | 'closed' }
  | { kind: 'create'; name: string; category: 'open' | 'in_progress' | 'closed' }

const asCategory = (c: string): 'open' | 'in_progress' | 'closed' =>
  c === 'closed' || c === 'in_progress' ? c : 'open'

/**
 * The category a status the import creates is given. Created statuses are
 * neutral in colour (§2.6), but a "Done" one must still count as done in every
 * rollup, the Closed toggle and the progress ring, which read the category.
 */
export function categoryForName(name: string): 'open' | 'in_progress' | 'closed' {
  const v = name.toLowerCase()
  if (/\b(done|complete|completed|closed|finished|resolved|cancel+ed|won'?t do)\b/.test(v)) return 'closed'
  if (/\b(progress|doing|review|testing|qa|active|started|blocked)\b/.test(v)) return 'in_progress'
  return 'open'
}

/** A status cell → one of the list's statuses (by name, then key, any case), or one to create. */
export function chooseStatus(cell: string, effective: EffectiveStatus[]): StatusChoice {
  const v = cell.trim().toLowerCase()
  const slug = v.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const hit = effective.find((s) => s.name.trim().toLowerCase() === v) ?? effective.find((s) => s.key === slug)
  if (hit) return { kind: 'existing', key: hit.key, category: asCategory(hit.category) }
  return { kind: 'create', name: cell.trim().slice(0, 60), category: categoryForName(cell) }
}

/** The status a row with no Status cell gets: "To do" when the list has it, else its first open one. */
export function defaultStatus(effective: EffectiveStatus[]): { key: string; category: 'open' | 'in_progress' | 'closed' } {
  const todo = effective.find((s) => s.key === 'todo')
  const pick = todo ?? effective.find((s) => s.category === 'open') ?? effective[0]
  return pick ? { key: pick.key, category: asCategory(pick.category) } : { key: 'todo', category: 'open' }
}

/** A key for a new status, unique among the owner's: lower-case, underscores, `_2`, `_3`… on collision. */
export function statusKeyFor(name: string, takenKeys: Iterable<string>): string {
  const taken = new Set(takenKeys)
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'status'
  if (!taken.has(base)) return base
  for (let i = 2; i < 1000; i++) {
    const k = `${base}_${i}`.slice(0, 64)
    if (!taken.has(k)) return k
  }
  return `${base}_${Date.now()}`.slice(0, 64)
}

// Who an assignee cell names: one rule, shared with the wizard (`@rundesk/imports`).
export { matchAssignee, type Member } from '@rundesk/imports'

/** Rows in batches of `size`, in order. */
export function batches<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** A short id for "Copy ID": `IMP-` and eight characters that cannot be misread (no 0/O, 1/I/L). */
export function supportReference(prefix = 'IMP', random: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(random() * alphabet.length)]
  return `${prefix}-${out}`
}
