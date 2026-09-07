import { format } from 'date-fns'
import type { TranslationKey } from './i18n'

/**
 * A1.4 / §V2-07 — the filter tree, and the only code that decides whether a
 * task matches it.
 *
 * This lived inside the 5,000-line list route, which meant the one part of
 * that file with real logic in it — does `(mine or unassigned)` match this
 * row — was the one part no test could reach. Nothing here touches React, a
 * query client or a router, so `task-filters.test.ts` can ask it directly.
 *
 * The task and custom-field shapes are STRUCTURAL rather than imported: this
 * module needs seven fields off a task and would otherwise drag the route's
 * whole `TaskItem` (and everything it references) behind it.
 */

export type FilterOp =
  | 'is' | 'isNot' | 'before' | 'after' | 'between'
  | 'contains' | 'gt' | 'lt' | 'isSet' | 'isNotSet'

export type FilterFieldKind = 'date' | 'user' | 'flag' | 'text' | 'number' | 'choice'

export type FilterRule = { id: string; field: string; op: FilterOp; value: string; value2?: string }

/**
 * §V2-07 "Add nested filter" — frame `11:41`.
 *
 * A group is a bracket: its own rules, joined by its own AND/OR, evaluated as
 * one term of the outer list. That is the whole difference between "urgent and
 * mine" and "urgent and (mine or unassigned)", and a flat list of ANDs cannot
 * say the second one at all.
 *
 * ONE LEVEL DEEP, deliberately: a group holds rules, never other groups. The
 * panel has no control for a bracket inside a bracket, so a deeper shape could
 * only arrive from a hand-written request — and the server refuses it.
 */
export type FilterGroup = { id: string; conjunction: 'and' | 'or'; rules: FilterRule[] }
export type FilterNode = FilterRule | FilterGroup

export const isFilterGroup = (node: FilterNode): node is FilterGroup =>
  Array.isArray((node as FilterGroup).rules)

/** Every rule in the tree, brackets flattened. */
export function filterLeaves(nodes: FilterNode[]): FilterRule[] {
  return nodes.flatMap((node) => (isFilterGroup(node) ? node.rules : [node]))
}

/** Leaves in a tree, for the counter on the toolbar chip. */
export function countLeaves(nodes: FilterNode[]): number {
  return filterLeaves(nodes).length
}

/** The sentinel one dropdown uses to say "nobody", shared by the funnel and the panel. */
export const UNASSIGNED_FILTER = '__unassigned__'

export const OPS_BY_KIND: Record<FilterFieldKind, FilterOp[]> = {
  date: ['before', 'after', 'between', 'isSet', 'isNotSet'],
  user: ['is', 'isNot'],
  flag: ['isSet', 'isNotSet'],
  text: ['contains', 'isSet', 'isNotSet'],
  number: ['gt', 'lt', 'isSet', 'isNotSet'],
  choice: ['is', 'isNot', 'isSet', 'isNotSet'],
}

/** Operators that ask only about presence, so the value input is hidden. */
export const VALUELESS_OPS: FilterOp[] = ['isSet', 'isNotSet']

/*
 * The fields frame `11:41` lists in the "Select filter" dropdown:
 *
 *   Status · Tags · Due date · Priority · Assignee · Archived ·
 *   Assigned comment · Created by · Date closed · Date created
 *
 * Status, Tags, Priority and Assignee reached only the column funnels before
 * this, which is fine for one click and useless inside a bracket — you cannot
 * write "(mine or unassigned)" with a checkbox list. Archived is NOT here: it
 * is a toolbar switch (§V2-07, `[11:37]`), and two controls for one piece of
 * state is how they end up disagreeing. "Assigned comment" is not here either
 * — Rundesk has no comment assignment to filter on, so a field named after it
 * would match nothing and say nothing about why.
 */
export const BUILTIN_FILTER_FIELDS: Array<{ id: string; kind: FilterFieldKind; labelKey: TranslationKey }> = [
  { id: 'status', kind: 'choice', labelKey: 'taskDetail.fieldStatus' },
  { id: 'tags', kind: 'choice', labelKey: 'list.filter.fieldTags' },
  { id: 'due', kind: 'date', labelKey: 'taskDetail.fieldDueDate' },
  { id: 'priority', kind: 'choice', labelKey: 'taskDetail.fieldPriority' },
  { id: 'assignee', kind: 'user', labelKey: 'taskDetail.fieldAssignees' },
  { id: 'start', kind: 'date', labelKey: 'list.filter.fieldStart' },
  { id: 'created', kind: 'date', labelKey: 'list.sortCreated' },
  { id: 'closed', kind: 'date', labelKey: 'list.filter.fieldClosed' },
  { id: 'creator', kind: 'user', labelKey: 'list.filter.fieldCreator' },
  { id: 'recurring', kind: 'flag', labelKey: 'list.filter.fieldRecurring' },
]

/**
 * Fields whose value on a task is a SET, not a scalar — a task has any number
 * of assignees and any number of tags. `is` on one of these means "contains"
 * and `isNot` means "does not contain"; running them through the scalar path
 * would compare an array to a string and quietly match nothing.
 */
export const MULTI_VALUE_FIELDS = new Set(['assignee', 'tags'])

/** Custom-field type → the operator set that makes sense for it. */
export const CUSTOM_FIELD_KIND: Record<string, FilterFieldKind> = {
  text: 'text',
  url: 'text',
  number: 'number',
  date: 'date',
  checkbox: 'choice',
  dropdown: 'choice',
}

/** Only what a rule reads off a task. */
export type FilterTask = {
  id: string
  status?: string | null
  priority?: string | null
  dueDate?: string | null
  startDate?: string | null
  createdAt?: string | null
  completedAt?: string | null
  createdById?: string | null
  recurrence?: unknown
  assignees?: Array<{ userId: string }>
  labels?: Array<{ id: string }>
}

export type FilterCustomField = { id: string; type: string }

/** Everything the rule evaluator needs beyond the task row itself. */
export type FilterContext = {
  customFields: FilterCustomField[]
  /** taskId → fieldId → value. Empty until a custom rule (or Table) loads it. */
  customValues: Record<string, Record<string, unknown>>
}

export function filterFieldKind(field: string, customFields: FilterCustomField[]): FilterFieldKind | null {
  const builtin = BUILTIN_FILTER_FIELDS.find((f) => f.id === field)
  if (builtin) return builtin.kind
  if (!field.startsWith('custom:')) return null
  const def = customFields.find((f) => f.id === field.slice('custom:'.length))
  return def ? (CUSTOM_FIELD_KIND[def.type] ?? null) : null
}

/** Local calendar day of an ISO timestamp, so date rules compare like the
 *  Calendar view groups — lexical order on `yyyy-MM-dd` is chronological. */
export function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : format(d, 'yyyy-MM-dd')
}

/** The raw value a rule's field holds on one task, or null when unset. */
export function ruleFieldValue(task: FilterTask, field: string, ctx: FilterContext): unknown {
  switch (field) {
    case 'status': return task.status ?? null
    case 'priority': return task.priority ?? null
    case 'closed': return task.completedAt ?? null
    case 'assignee': return (task.assignees ?? []).map((a) => a.userId)
    case 'tags': return (task.labels ?? []).map((l) => l.id)
    case 'due': return task.dueDate ?? null
    case 'start': return task.startDate ?? null
    case 'created': return task.createdAt ?? null
    case 'creator': return task.createdById ?? null
    case 'recurring': return task.recurrence ?? null
    default: {
      if (!field.startsWith('custom:')) return null
      const raw = ctx.customValues[task.id]?.[field.slice('custom:'.length)]
      // A false checkbox is a real answer, not an empty one.
      return raw === undefined || raw === '' ? null : raw
    }
  }
}

export function matchesRule(task: FilterTask, rule: FilterRule, ctx: FilterContext): boolean {
  const kind = filterFieldKind(rule.field, ctx.customFields)
  if (!kind) return true // the field was deleted underneath the view — don't hide rows
  const value = ruleFieldValue(task, rule.field, ctx)

  if (MULTI_VALUE_FIELDS.has(rule.field)) {
    const ids = Array.isArray(value) ? (value as string[]) : []
    if (rule.op === 'isSet') return ids.length > 0
    if (rule.op === 'isNotSet') return ids.length === 0
    if (!rule.value.trim()) return true // half-built rule filters nothing
    const has = rule.value === UNASSIGNED_FILTER ? ids.length === 0 : ids.includes(rule.value)
    return rule.op === 'isNot' ? !has : has
  }

  if (rule.op === 'isSet') return value !== null && value !== false
  if (rule.op === 'isNotSet') return value === null || value === false
  if (value === null) return false
  if (!rule.value.trim()) return true // half-built rule filters nothing

  if (kind === 'date') {
    const key = dayKey(String(value))
    if (!key) return false
    if (rule.op === 'before') return key < rule.value
    if (rule.op === 'after') return key > rule.value
    if (rule.op === 'between') return key >= rule.value && key <= (rule.value2 || rule.value)
    return true
  }
  if (kind === 'number') {
    const num = Number(value)
    const target = Number(rule.value)
    if (Number.isNaN(num) || Number.isNaN(target)) return false
    return rule.op === 'gt' ? num > target : num < target
  }
  const text = String(value).toLowerCase()
  if (rule.op === 'contains') return text.includes(rule.value.trim().toLowerCase())
  if (rule.op === 'is') return text === rule.value.toLowerCase()
  if (rule.op === 'isNot') return text !== rule.value.toLowerCase()
  return true
}

/**
 * One term of the filter: a rule, or a bracket of rules joined by its own
 * AND/OR. An empty bracket matches everything rather than nothing — you have
 * just added it and not yet said what goes in it, and a list that empties
 * itself the moment you click "Add nested filter" is a list that looks broken.
 */
export function matchesNode(task: FilterTask, node: FilterNode, ctx: FilterContext): boolean {
  if (!isFilterGroup(node)) return matchesRule(task, node, ctx)
  if (node.rules.length === 0) return true
  return node.conjunction === 'or'
    ? node.rules.some((r) => matchesRule(task, r, ctx))
    : node.rules.every((r) => matchesRule(task, r, ctx))
}

/** The whole tree, top level ANDed — `where A and B and (C or D)`. */
export function matchesFilter(task: FilterTask, nodes: FilterNode[], ctx: FilterContext): boolean {
  return !nodes.some((node) => !matchesNode(task, node, ctx))
}
