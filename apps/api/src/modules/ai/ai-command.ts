import type Anthropic from '@anthropic-ai/sdk'

/**
 * Agentic AI command capability (Plan §7.6 / §7.8): a bounded tool set the model
 * may call, a PURE planner that turns tool calls into a preview→confirm plan
 * (mutations are proposed, never executed here), and the result shapes shared by
 * `AiService.command` / `AiService.executeActions` and the tests.
 *
 * Everything in this file is deterministic and DB-free so the plan logic is
 * unit-testable without a live model (`planFromToolCalls`) — the execute half
 * lives in `AiService.executeActions` against real tasks.
 */

export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low'
export type StatusCategory = 'open' | 'in_progress' | 'closed'

const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'normal', 'low']

/** A task as the planner sees it — a bounded projection of the workspace. */
export type CommandTask = {
  id: string
  title: string
  listId: string
  status: string
  statusCategory: StatusCategory
  dueDate: string | null // YYYY-MM-DD, or null when unset
  assigneeEmails: string[]
}

export type CommandList = {
  id: string
  name: string
  /** Human path "Space / Project / List" for honest labels + the model catalog. */
  path: string
}

export type CommandMember = {
  userId: string
  email: string
  displayName: string | null
}

/** Everything the pure planner needs — resolved server-side from the workspace. */
export type CommandContext = {
  today: string // YYYY-MM-DD
  lists: CommandList[]
  members: CommandMember[]
  tasks: CommandTask[]
}

/**
 * A single MUTATING action in a plan. Args are already resolved + validated
 * server-side (assigneeEmail→assigneeId, listId/taskIds verified in-workspace),
 * so `executeActions` can act on them directly after the user confirms.
 */
export type PlanAction =
  | {
      tool: 'create_task'
      args: {
        listId: string
        title: string
        priority?: TaskPriority
        description?: string
        dueDate?: string
        assigneeId?: string
        assigneeEmail?: string
      }
      humanLabel: string
      affectedTaskIds?: string[]
    }
  | {
      tool: 'set_task_status'
      args: { taskId: string; status: string }
      humanLabel: string
      affectedTaskIds: string[]
    }
  | {
      tool: 'reschedule_task'
      args: { taskId: string; dueDate: string }
      humanLabel: string
      affectedTaskIds: string[]
    }
  | {
      tool: 'assign_task'
      args: { taskId: string; assigneeId: string; assigneeEmail: string }
      humanLabel: string
      affectedTaskIds: string[]
    }
  | {
      tool: 'bulk_reschedule'
      args: { taskIds: string[]; dueDate: string }
      humanLabel: string
      affectedTaskIds: string[]
    }

export type CommandSearchResult = {
  query: string
  tasks: Array<{
    id: string
    title: string
    status: string
    dueDate: string | null
    assigneeEmails: string[]
  }>
}

/** Structured plan returned by `POST /ai/command` for the user to confirm. */
export type CommandPlan = {
  summary: string
  actions: PlanAction[]
  /** Results of any READ-ONLY search tool calls, executed to inform the plan. */
  readOnlyResults: CommandSearchResult[]
  /** Human-readable notes about tool calls that could not be turned into actions. */
  warnings: string[]
}

export type CommandActionResult = {
  tool: PlanAction['tool']
  humanLabel: string
  status: 'succeeded' | 'skipped' | 'failed'
  reason?: string
  affectedTaskIds?: string[]
}

export type CommandExecuteResult = { results: CommandActionResult[] }

/** One tool call collected from the model: name + parsed input object. */
export type ToolCall = { name: string; input: Record<string, unknown> }

/**
 * The bounded tool set exposed to the model. Only `search_tasks` is read-only;
 * the rest are mutating and get previewed rather than executed.
 */
export const COMMAND_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'search_tasks',
    description:
      'READ-ONLY. Find tasks in the workspace by a free-text title query and/or filters. Use this first to locate the task ids you need before proposing changes. Returns matching tasks with their ids.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Case-insensitive substring matched against task titles.' },
        status: { type: 'string', description: 'Match a status key (e.g. "todo", "done") or a category (open/in_progress/closed).' },
        assigneeEmail: { type: 'string', description: 'Only tasks assigned to this member email.' },
        dueBefore: { type: 'string', description: 'Only tasks whose due date is before this YYYY-MM-DD date.' },
      },
    },
  },
  {
    name: 'create_task',
    description:
      'Create a new task. Choose a listId from the "Available lists" catalog. Resolve any assignee by their email address.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Concise, action-oriented task title.' },
        listId: { type: 'string', description: 'The destination list id (from Available lists).' },
        priority: { type: 'string', enum: PRIORITIES, description: 'Task priority.' },
        description: { type: 'string', description: 'Optional markdown description.' },
        dueDate: { type: 'string', description: 'Optional due date, YYYY-MM-DD.' },
        assigneeEmail: { type: 'string', description: 'Optional assignee, by workspace member email.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'set_task_status',
    description: 'Change the status of an existing task (e.g. mark it done, in progress, todo).',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The id of the task to update.' },
        status: { type: 'string', description: 'The new status key (e.g. "done", "in_progress", "todo").' },
      },
      required: ['taskId', 'status'],
    },
  },
  {
    name: 'reschedule_task',
    description: 'Move a single task to a new due date.',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The id of the task to reschedule.' },
        dueDate: { type: 'string', description: 'The new due date, YYYY-MM-DD.' },
      },
      required: ['taskId', 'dueDate'],
    },
  },
  {
    name: 'assign_task',
    description: 'Assign a task to a workspace member, resolved by their email.',
    input_schema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The id of the task to assign.' },
        assigneeEmail: { type: 'string', description: 'The member email to assign the task to.' },
      },
      required: ['taskId', 'assigneeEmail'],
    },
  },
  {
    name: 'bulk_reschedule',
    description:
      'Move many tasks at once to a new date. Provide a filter (any of overdue / dueBefore / status) selecting which tasks to move. The canonical "move all overdue tasks to next week" command.',
    input_schema: {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          properties: {
            overdue: { type: 'boolean', description: 'Select tasks whose due date is in the past and are not closed.' },
            dueBefore: { type: 'string', description: 'Select tasks due before this YYYY-MM-DD date.' },
            status: { type: 'string', description: 'Select tasks with this status key or category.' },
          },
        },
        toDate: { type: 'string', description: 'The new due date for all matched tasks, YYYY-MM-DD.' },
      },
      required: ['filter', 'toDate'],
    },
  },
]

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function asDay(value: unknown): string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : ''
}

/** Lexical YYYY-MM-DD comparison is a correct chronological compare. */
function isBeforeDay(day: string | null, boundary: string): boolean {
  return !!day && !!boundary && day < boundary
}

function statusMatches(task: CommandTask, wanted: string): boolean {
  const w = normalize(wanted)
  return !w || task.status.toLowerCase() === w || task.statusCategory === w
}

function resolveMember(email: unknown, ctx: CommandContext): CommandMember | undefined {
  const e = normalize(email)
  if (!e) return undefined
  return ctx.members.find((m) => m.email.toLowerCase() === e)
}

/**
 * Execute a READ-ONLY `search_tasks` call against the context (pure). Shared by
 * the planner (for `readOnlyResults`) and the agentic loop (to feed the model).
 */
export function searchTasksInContext(input: Record<string, unknown>, ctx: CommandContext): CommandTask[] {
  const query = normalize(input.query)
  const status = normalize(input.status)
  const assigneeEmail = normalize(input.assigneeEmail)
  const dueBefore = asDay(input.dueBefore)
  return ctx.tasks.filter((task) => {
    if (query && !task.title.toLowerCase().includes(query)) return false
    if (status && !statusMatches(task, status)) return false
    if (assigneeEmail && !task.assigneeEmails.some((e) => e.toLowerCase() === assigneeEmail)) return false
    if (dueBefore && !isBeforeDay(task.dueDate, dueBefore)) return false
    return true
  })
}

/** Resolve the set of tasks a `bulk_reschedule` filter selects (pure). */
export function tasksForBulkFilter(filter: Record<string, unknown>, ctx: CommandContext): CommandTask[] {
  const overdue = filter.overdue === true
  const dueBefore = asDay(filter.dueBefore)
  const status = normalize(filter.status)
  // Require at least one selector so an empty filter never matches everything.
  if (!overdue && !dueBefore && !status) return []
  return ctx.tasks.filter((task) => {
    if (overdue && !(task.dueDate && task.dueDate < ctx.today && task.statusCategory !== 'closed')) return false
    if (dueBefore && !isBeforeDay(task.dueDate, dueBefore)) return false
    if (status && !statusMatches(task, status)) return false
    return true
  })
}

function bulkFilterDescription(filter: Record<string, unknown>): string {
  if (filter.overdue === true) return 'overdue tasks'
  if (typeof filter.status === 'string' && filter.status.trim()) return `${filter.status.trim()} tasks`
  const dueBefore = asDay(filter.dueBefore)
  if (dueBefore) return `tasks due before ${dueBefore}`
  return 'tasks'
}

function buildSummary(actions: PlanAction[], readOnly: CommandSearchResult[], narrative?: string): string {
  if (narrative && narrative.trim()) return narrative.trim()
  if (actions.length === 0) {
    return readOnly.length
      ? 'Found matching tasks. No changes were proposed.'
      : 'No changes were proposed for this request.'
  }
  const counts = new Map<PlanAction['tool'], number>()
  for (const a of actions) counts.set(a.tool, (counts.get(a.tool) ?? 0) + 1)
  const labels: Record<PlanAction['tool'], string> = {
    create_task: 'task creation',
    set_task_status: 'status change',
    reschedule_task: 'reschedule',
    assign_task: 'assignment',
    bulk_reschedule: 'bulk reschedule',
  }
  const parts = [...counts.entries()].map(([tool, n]) => `${n} ${labels[tool]}${n > 1 ? 's' : ''}`)
  return `Proposed ${actions.length} change${actions.length > 1 ? 's' : ''}: ${parts.join(', ')}.`
}

/**
 * PURE core (Plan §7.6/§7.8). Turn the model's tool calls into a confirmable plan:
 *  - READ-ONLY `search_tasks` calls are executed against the context → `readOnlyResults`.
 *  - MUTATING calls are validated + resolved and returned as `actions` — never executed.
 *  - Anything that can't be resolved (unknown task/list, non-member assignee) becomes a `warning`.
 */
export function planFromToolCalls(
  toolCalls: ToolCall[],
  ctx: CommandContext,
  narrative?: string,
): CommandPlan {
  const actions: PlanAction[] = []
  const readOnlyResults: CommandSearchResult[] = []
  const warnings: string[] = []
  const taskById = new Map(ctx.tasks.map((t) => [t.id, t]))
  const listById = new Map(ctx.lists.map((l) => [l.id, l]))

  for (const call of toolCalls) {
    const input = (call.input ?? {}) as Record<string, unknown>
    switch (call.name) {
      case 'search_tasks': {
        const found = searchTasksInContext(input, ctx)
        readOnlyResults.push({
          query: typeof input.query === 'string' ? input.query : '',
          tasks: found.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            dueDate: t.dueDate,
            assigneeEmails: t.assigneeEmails,
          })),
        })
        break
      }
      case 'create_task': {
        const title = typeof input.title === 'string' ? input.title.trim() : ''
        if (!title) {
          warnings.push('Skipped a create request: no title was provided.')
          break
        }
        let listId = typeof input.listId === 'string' ? input.listId : ''
        if (listId && !listById.has(listId)) {
          warnings.push(`Skipped creating "${title}": that list is not in this workspace.`)
          break
        }
        if (!listId) {
          if (ctx.lists.length === 1) listId = ctx.lists[0].id
          else {
            warnings.push(`Skipped creating "${title}": no destination list was specified.`)
            break
          }
        }
        const priority = PRIORITIES.includes(input.priority as TaskPriority) ? (input.priority as TaskPriority) : undefined
        const description =
          typeof input.description === 'string' && input.description.trim() ? input.description.trim() : undefined
        const dueDate = asDay(input.dueDate) || undefined
        let assigneeId: string | undefined
        let assigneeEmail: string | undefined
        if (input.assigneeEmail != null && String(input.assigneeEmail).trim()) {
          const member = resolveMember(input.assigneeEmail, ctx)
          if (member) {
            assigneeId = member.userId
            assigneeEmail = member.email
          } else {
            warnings.push(`Creating "${title}" without an assignee: ${String(input.assigneeEmail)} is not a workspace member.`)
          }
        }
        const path = listById.get(listId)?.path ?? 'the workspace'
        const bits = [
          priority ? `${priority} priority` : '',
          dueDate ? `due ${dueDate}` : '',
          assigneeEmail ? `assigned to ${assigneeEmail}` : '',
        ].filter(Boolean)
        actions.push({
          tool: 'create_task',
          args: { listId, title, priority, description, dueDate, assigneeId, assigneeEmail },
          humanLabel: `Create task "${title}" in ${path}${bits.length ? ` (${bits.join(', ')})` : ''}`,
        })
        break
      }
      case 'set_task_status': {
        const taskId = typeof input.taskId === 'string' ? input.taskId : ''
        const status = typeof input.status === 'string' ? input.status.trim() : ''
        const task = taskById.get(taskId)
        if (!task) {
          warnings.push('Skipped a status change: the referenced task is not in this workspace.')
          break
        }
        if (!status) {
          warnings.push(`Skipped a status change for "${task.title}": no status was provided.`)
          break
        }
        actions.push({
          tool: 'set_task_status',
          args: { taskId, status },
          humanLabel: `Set "${task.title}" to ${status}`,
          affectedTaskIds: [taskId],
        })
        break
      }
      case 'reschedule_task': {
        const taskId = typeof input.taskId === 'string' ? input.taskId : ''
        const task = taskById.get(taskId)
        if (!task) {
          warnings.push('Skipped a reschedule: the referenced task is not in this workspace.')
          break
        }
        const dueDate = asDay(input.dueDate)
        if (!dueDate) {
          warnings.push(`Skipped rescheduling "${task.title}": an invalid date was provided.`)
          break
        }
        actions.push({
          tool: 'reschedule_task',
          args: { taskId, dueDate },
          humanLabel: `Reschedule "${task.title}" to ${dueDate}`,
          affectedTaskIds: [taskId],
        })
        break
      }
      case 'assign_task': {
        const taskId = typeof input.taskId === 'string' ? input.taskId : ''
        const task = taskById.get(taskId)
        if (!task) {
          warnings.push('Skipped an assignment: the referenced task is not in this workspace.')
          break
        }
        const member = resolveMember(input.assigneeEmail, ctx)
        if (!member) {
          warnings.push(`Skipped assigning "${task.title}": ${String(input.assigneeEmail ?? '')} is not a workspace member.`)
          break
        }
        actions.push({
          tool: 'assign_task',
          args: { taskId, assigneeId: member.userId, assigneeEmail: member.email },
          humanLabel: `Assign "${task.title}" to ${member.email}`,
          affectedTaskIds: [taskId],
        })
        break
      }
      case 'bulk_reschedule': {
        const filter = (input.filter ?? {}) as Record<string, unknown>
        const toDate = asDay(input.toDate)
        if (!toDate) {
          warnings.push('Skipped a bulk reschedule: an invalid target date was provided.')
          break
        }
        const matched = tasksForBulkFilter(filter, ctx)
        if (matched.length === 0) {
          warnings.push('A bulk reschedule matched no tasks.')
          break
        }
        const taskIds = matched.map((t) => t.id)
        actions.push({
          tool: 'bulk_reschedule',
          args: { taskIds, dueDate: toDate },
          humanLabel: `Move ${taskIds.length} ${bulkFilterDescription(filter)} to ${toDate}`,
          affectedTaskIds: taskIds,
        })
        break
      }
      default:
        warnings.push(`Ignored an unsupported tool: ${call.name}`)
    }
  }

  return { summary: buildSummary(actions, readOnlyResults, narrative), actions, readOnlyResults, warnings }
}
