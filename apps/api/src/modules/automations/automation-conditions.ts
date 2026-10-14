/**
 * AN AUTOMATION'S CONDITIONS (`found-14-oct/automation-conditions-and-actions-unbuilt`).
 *
 * ClickUp lets a rule add conditions to its trigger — "only if the priority is
 * Urgent", "only if the task has the tag Client" — and runs its actions only
 * when they hold: every one of them, or any one, as the rule says. Here a
 * condition is a field of the task the event is about, an operator and a value,
 * read from the task as it is when the event fires. A rule may have up to
 * fifteen. Each verdict is kept with the run, so a rule that did not act says
 * which condition stopped it.
 *
 * Pure: the task's facts are handed in, so the verdicts are unit-tested.
 */

export const MAX_CONDITIONS = 15

export const CONDITION_FIELDS = ['status', 'priority', 'assignee', 'list', 'tag', 'due_date', 'title'] as const
export type ConditionField = (typeof CONDITION_FIELDS)[number]

export const CONDITION_OPERATORS = ['is', 'is_not', 'any_of', 'none_of', 'is_set', 'is_not_set', 'contains', 'before', 'after'] as const
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number]

export type Condition = { field: ConditionField; operator: ConditionOperator; value?: string | string[] }
export type ConditionMatch = 'all' | 'any'

/** What the conditions read: the task as it is when the event fires. */
export type TaskFacts = {
  status: string | null
  priority: string | null
  /** Its assignees' ids. */
  assignees: string[]
  /** The List it lives in, and any other it is in. */
  lists: string[]
  /** Its tags' names. */
  tags: string[]
  dueDate: Date | null
  title: string
}

export type ConditionVerdict = { field: ConditionField; operator: ConditionOperator; value: string | string[] | null; passed: boolean }

/** Which operators each field takes: a date compares, a title contains, the rest are values or sets of them. */
const OPERATORS_OF: Record<ConditionField, readonly ConditionOperator[]> = {
  status: ['is', 'is_not', 'any_of', 'none_of'],
  priority: ['is', 'is_not', 'any_of', 'none_of', 'is_set', 'is_not_set'],
  assignee: ['is', 'is_not', 'any_of', 'none_of', 'is_set', 'is_not_set'],
  list: ['is', 'is_not', 'any_of', 'none_of'],
  tag: ['is', 'is_not', 'any_of', 'none_of', 'is_set', 'is_not_set'],
  due_date: ['is_set', 'is_not_set', 'before', 'after'],
  title: ['is', 'is_not', 'contains'],
}

export const operatorsOf = (field: ConditionField): readonly ConditionOperator[] => OPERATORS_OF[field]

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()
const listOf = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v : String(v ?? '').split(',')).map(norm).filter(Boolean)

/** A rule's conditions as stored, or the reason they cannot be. */
export function normaliseConditions(raw: unknown): { conditions: Condition[]; match: ConditionMatch } | { error: string } {
  if (raw === undefined || raw === null) return { conditions: [], match: 'all' }
  if (!Array.isArray(raw)) return { error: 'An automation’s conditions are a list' }
  if (raw.length > MAX_CONDITIONS) return { error: `An automation has at most ${MAX_CONDITIONS} conditions` }
  const out: Condition[] = []
  for (const [i, c] of raw.entries()) {
    const field = (c as { field?: unknown })?.field
    const operator = (c as { operator?: unknown })?.operator
    if (!(CONDITION_FIELDS as readonly unknown[]).includes(field)) return { error: `Condition ${i + 1} names no field an automation can read` }
    if (!OPERATORS_OF[field as ConditionField].includes(operator as ConditionOperator)) {
      return { error: `Condition ${i + 1}: “${String(operator)}” is not something ${String(field).replace('_', ' ')} can be compared by` }
    }
    const value = (c as { value?: unknown }).value
    const needsValue = operator !== 'is_set' && operator !== 'is_not_set'
    const clean = Array.isArray(value) ? value.map(String).filter((s) => s.trim()) : typeof value === 'string' ? value : undefined
    if (needsValue && (clean === undefined || (Array.isArray(clean) ? clean.length === 0 : !clean.trim()))) {
      return { error: `Condition ${i + 1} needs a value to compare with` }
    }
    if ((operator === 'before' || operator === 'after') && Number.isNaN(new Date(String(clean)).getTime())) {
      return { error: `Condition ${i + 1} needs a date` }
    }
    out.push({ field: field as ConditionField, operator: operator as ConditionOperator, ...(needsValue ? { value: clean } : {}) })
  }
  return { conditions: out, match: 'all' }
}

/** The task's values for a field, as a set of lower-case strings (one for a single-valued field). */
function valuesOf(field: ConditionField, task: TaskFacts): string[] {
  switch (field) {
    case 'status':
      return task.status ? [norm(task.status)] : []
    case 'priority':
      return task.priority ? [norm(task.priority)] : []
    case 'assignee':
      return task.assignees.map(norm)
    case 'list':
      return task.lists.map(norm)
    case 'tag':
      return task.tags.map(norm)
    case 'title':
      return [norm(task.title)]
    case 'due_date':
      return task.dueDate ? [task.dueDate.toISOString()] : []
  }
}

export function evaluateCondition(c: Condition, task: TaskFacts): ConditionVerdict {
  const have = valuesOf(c.field, task)
  const wanted = listOf(c.value)
  let passed = false
  switch (c.operator) {
    case 'is':
      // A value of a set (a tag, an assignee) "is" there when the task has it.
      passed = wanted.length === 1 && have.includes(wanted[0])
      break
    case 'is_not':
      passed = wanted.length === 1 && !have.includes(wanted[0])
      break
    case 'any_of':
      passed = have.some((v) => wanted.includes(v))
      break
    case 'none_of':
      passed = !have.some((v) => wanted.includes(v))
      break
    case 'is_set':
      passed = have.length > 0
      break
    case 'is_not_set':
      passed = have.length === 0
      break
    case 'contains':
      passed = wanted.length > 0 && have.some((v) => v.includes(norm(c.value as string)))
      break
    case 'before':
    case 'after': {
      const at = new Date(String(c.value)).getTime()
      const due = task.dueDate?.getTime()
      passed = due !== undefined && !Number.isNaN(at) && (c.operator === 'before' ? due < at : due > at)
      break
    }
  }
  return { field: c.field, operator: c.operator, value: c.value ?? null, passed }
}

/** Every condition's verdict, and whether the rule acts: all of them held, or any one, as it says. No conditions: it acts. */
export function evaluateConditions(conditions: Condition[], match: ConditionMatch, task: TaskFacts): { passed: boolean; verdicts: ConditionVerdict[] } {
  const verdicts = conditions.map((c) => evaluateCondition(c, task))
  if (!verdicts.length) return { passed: true, verdicts }
  return { passed: match === 'any' ? verdicts.some((v) => v.passed) : verdicts.every((v) => v.passed), verdicts }
}
