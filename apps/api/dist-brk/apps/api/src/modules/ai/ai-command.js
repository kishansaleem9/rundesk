"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NO_CHANGES_MADE = exports.COMMAND_TOOLS = void 0;
exports.searchTasksInContext = searchTasksInContext;
exports.tasksForBulkFilter = tasksForBulkFilter;
exports.planFromToolCalls = planFromToolCalls;
const PRIORITIES = ['urgent', 'high', 'normal', 'low'];
/**
 * The bounded tool set exposed to the model. Only `search_tasks` is read-only;
 * the rest are mutating and get previewed rather than executed.
 */
exports.COMMAND_TOOLS = [
    {
        name: 'search_tasks',
        description: 'READ-ONLY. Find tasks in the workspace by a free-text title query and/or filters. Use this first to locate the task ids you need before proposing changes. Returns matching tasks with their ids.',
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
        description: 'Create a new task. Choose a listId from the "Available lists" catalog. Resolve any assignee by their email address.',
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
        description: 'Move many tasks at once to a new date. Provide a filter (any of overdue / dueBefore / status) selecting which tasks to move. The canonical "move all overdue tasks to next week" command.',
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
];
function normalize(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
function asDay(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
}
/** Lexical YYYY-MM-DD comparison is a correct chronological compare. */
function isBeforeDay(day, boundary) {
    return !!day && !!boundary && day < boundary;
}
function statusMatches(task, wanted) {
    const w = normalize(wanted);
    return !w || task.status.toLowerCase() === w || task.statusCategory === w;
}
function resolveMember(email, ctx) {
    const e = normalize(email);
    if (!e)
        return undefined;
    return ctx.members.find((m) => m.email.toLowerCase() === e);
}
/**
 * Execute a READ-ONLY `search_tasks` call against the context (pure). Shared by
 * the planner (for `readOnlyResults`) and the agentic loop (to feed the model).
 */
function searchTasksInContext(input, ctx) {
    const query = normalize(input.query);
    const status = normalize(input.status);
    const assigneeEmail = normalize(input.assigneeEmail);
    const dueBefore = asDay(input.dueBefore);
    return ctx.tasks.filter((task) => {
        if (query && !task.title.toLowerCase().includes(query))
            return false;
        if (status && !statusMatches(task, status))
            return false;
        if (assigneeEmail && !task.assigneeEmails.some((e) => e.toLowerCase() === assigneeEmail))
            return false;
        if (dueBefore && !isBeforeDay(task.dueDate, dueBefore))
            return false;
        return true;
    });
}
/** Resolve the set of tasks a `bulk_reschedule` filter selects (pure). */
function tasksForBulkFilter(filter, ctx) {
    const overdue = filter.overdue === true;
    const dueBefore = asDay(filter.dueBefore);
    const status = normalize(filter.status);
    // Require at least one selector so an empty filter never matches everything.
    if (!overdue && !dueBefore && !status)
        return [];
    return ctx.tasks.filter((task) => {
        if (overdue && !(task.dueDate && task.dueDate < ctx.today && task.statusCategory !== 'closed'))
            return false;
        if (dueBefore && !isBeforeDay(task.dueDate, dueBefore))
            return false;
        if (status && !statusMatches(task, status))
            return false;
        return true;
    });
}
function bulkFilterDescription(filter) {
    if (filter.overdue === true)
        return 'overdue tasks';
    if (typeof filter.status === 'string' && filter.status.trim())
        return `${filter.status.trim()} tasks`;
    const dueBefore = asDay(filter.dueBefore);
    if (dueBefore)
        return `tasks due before ${dueBefore}`;
    return 'tasks';
}
/** §V2-11 — the words the audit says are worth stealing outright. */
exports.NO_CHANGES_MADE = 'No changes made.';
/**
 * Does this sentence already admit that nothing happened?
 *
 * Checked so the plain statement is not doubled onto a model that already said
 * it — "No changes made. I did not make any changes." reads like a stutter, and
 * a person who sees the product stutter trusts the rest of it less.
 */
function alreadySaysNothingHappened(narrative) {
    return /\bno changes\b|\bnothing (?:was |has been )?changed\b|\bdid ?n[o']t (?:make|change)\b/i.test(narrative);
}
function buildSummary(actions, readOnly, narrative) {
    const told = narrative?.trim();
    /*
     * §V2-11 — "No changes made.", and why it comes FIRST.
     *
     * This used to return the model's narrative unconditionally, which is fine
     * when something happened and dangerous when nothing did: a model that
     * proposed no actions can still write "I've updated those tasks for you", and
     * that sentence became the whole answer. The person reads a success, closes
     * the panel, and finds out later that their work was never done.
     *
     * So when there is nothing to show — no actions, no search results — the fact
     * leads and the model's account follows as explanation. The narrative is kept
     * rather than discarded because WHY it could not act is the useful half.
     */
    if (actions.length === 0 && readOnly.length === 0) {
        if (!told)
            return exports.NO_CHANGES_MADE;
        return alreadySaysNothingHappened(told) ? told : `${exports.NO_CHANGES_MADE} ${told}`;
    }
    if (told)
        return told;
    if (actions.length === 0) {
        return readOnly.length
            ? 'Found matching tasks. No changes were proposed.'
            : `${exports.NO_CHANGES_MADE} Nothing in this request could be turned into a change.`;
    }
    const counts = new Map();
    for (const a of actions)
        counts.set(a.tool, (counts.get(a.tool) ?? 0) + 1);
    const labels = {
        create_task: 'task creation',
        set_task_status: 'status change',
        reschedule_task: 'reschedule',
        assign_task: 'assignment',
        bulk_reschedule: 'bulk reschedule',
    };
    const parts = [...counts.entries()].map(([tool, n]) => `${n} ${labels[tool]}${n > 1 ? 's' : ''}`);
    return `Proposed ${actions.length} change${actions.length > 1 ? 's' : ''}: ${parts.join(', ')}.`;
}
/**
 * PURE core (Plan §7.6/§7.8). Turn the model's tool calls into a confirmable plan:
 *  - READ-ONLY `search_tasks` calls are executed against the context → `readOnlyResults`.
 *  - MUTATING calls are validated + resolved and returned as `actions` — never executed.
 *  - Anything that can't be resolved (unknown task/list, non-member assignee) becomes a `warning`.
 */
function planFromToolCalls(toolCalls, ctx, narrative) {
    const actions = [];
    const readOnlyResults = [];
    const warnings = [];
    const taskById = new Map(ctx.tasks.map((t) => [t.id, t]));
    const listById = new Map(ctx.lists.map((l) => [l.id, l]));
    for (const call of toolCalls) {
        const input = (call.input ?? {});
        switch (call.name) {
            case 'search_tasks': {
                const found = searchTasksInContext(input, ctx);
                readOnlyResults.push({
                    query: typeof input.query === 'string' ? input.query : '',
                    tasks: found.map((t) => ({
                        id: t.id,
                        title: t.title,
                        status: t.status,
                        dueDate: t.dueDate,
                        assigneeEmails: t.assigneeEmails,
                    })),
                });
                break;
            }
            case 'create_task': {
                const title = typeof input.title === 'string' ? input.title.trim() : '';
                if (!title) {
                    warnings.push('Skipped a create request: no title was provided.');
                    break;
                }
                let listId = typeof input.listId === 'string' ? input.listId : '';
                if (listId && !listById.has(listId)) {
                    warnings.push(`Skipped creating "${title}": that list is not in this workspace.`);
                    break;
                }
                if (!listId) {
                    if (ctx.lists.length === 1)
                        listId = ctx.lists[0].id;
                    else {
                        warnings.push(`Skipped creating "${title}": no destination list was specified.`);
                        break;
                    }
                }
                const priority = PRIORITIES.includes(input.priority) ? input.priority : undefined;
                const description = typeof input.description === 'string' && input.description.trim() ? input.description.trim() : undefined;
                const dueDate = asDay(input.dueDate) || undefined;
                let assigneeId;
                let assigneeEmail;
                if (input.assigneeEmail != null && String(input.assigneeEmail).trim()) {
                    const member = resolveMember(input.assigneeEmail, ctx);
                    if (member) {
                        assigneeId = member.userId;
                        assigneeEmail = member.email;
                    }
                    else {
                        warnings.push(`Creating "${title}" without an assignee: ${String(input.assigneeEmail)} is not a workspace member.`);
                    }
                }
                const path = listById.get(listId)?.path ?? 'the workspace';
                const bits = [
                    priority ? `${priority} priority` : '',
                    dueDate ? `due ${dueDate}` : '',
                    assigneeEmail ? `assigned to ${assigneeEmail}` : '',
                ].filter(Boolean);
                actions.push({
                    tool: 'create_task',
                    args: { listId, title, priority, description, dueDate, assigneeId, assigneeEmail },
                    humanLabel: `Create task "${title}" in ${path}${bits.length ? ` (${bits.join(', ')})` : ''}`,
                });
                break;
            }
            case 'set_task_status': {
                const taskId = typeof input.taskId === 'string' ? input.taskId : '';
                const status = typeof input.status === 'string' ? input.status.trim() : '';
                const task = taskById.get(taskId);
                if (!task) {
                    warnings.push('Skipped a status change: the referenced task is not in this workspace.');
                    break;
                }
                if (!status) {
                    warnings.push(`Skipped a status change for "${task.title}": no status was provided.`);
                    break;
                }
                actions.push({
                    tool: 'set_task_status',
                    args: { taskId, status },
                    humanLabel: `Set "${task.title}" to ${status}`,
                    affectedTaskIds: [taskId],
                });
                break;
            }
            case 'reschedule_task': {
                const taskId = typeof input.taskId === 'string' ? input.taskId : '';
                const task = taskById.get(taskId);
                if (!task) {
                    warnings.push('Skipped a reschedule: the referenced task is not in this workspace.');
                    break;
                }
                const dueDate = asDay(input.dueDate);
                if (!dueDate) {
                    warnings.push(`Skipped rescheduling "${task.title}": an invalid date was provided.`);
                    break;
                }
                actions.push({
                    tool: 'reschedule_task',
                    args: { taskId, dueDate },
                    humanLabel: `Reschedule "${task.title}" to ${dueDate}`,
                    affectedTaskIds: [taskId],
                });
                break;
            }
            case 'assign_task': {
                const taskId = typeof input.taskId === 'string' ? input.taskId : '';
                const task = taskById.get(taskId);
                if (!task) {
                    warnings.push('Skipped an assignment: the referenced task is not in this workspace.');
                    break;
                }
                const member = resolveMember(input.assigneeEmail, ctx);
                if (!member) {
                    warnings.push(`Skipped assigning "${task.title}": ${String(input.assigneeEmail ?? '')} is not a workspace member.`);
                    break;
                }
                actions.push({
                    tool: 'assign_task',
                    args: { taskId, assigneeId: member.userId, assigneeEmail: member.email },
                    humanLabel: `Assign "${task.title}" to ${member.email}`,
                    affectedTaskIds: [taskId],
                });
                break;
            }
            case 'bulk_reschedule': {
                const filter = (input.filter ?? {});
                const toDate = asDay(input.toDate);
                if (!toDate) {
                    warnings.push('Skipped a bulk reschedule: an invalid target date was provided.');
                    break;
                }
                const matched = tasksForBulkFilter(filter, ctx);
                if (matched.length === 0) {
                    warnings.push('A bulk reschedule matched no tasks.');
                    break;
                }
                const taskIds = matched.map((t) => t.id);
                actions.push({
                    tool: 'bulk_reschedule',
                    args: { taskIds, dueDate: toDate },
                    humanLabel: `Move ${taskIds.length} ${bulkFilterDescription(filter)} to ${toDate}`,
                    affectedTaskIds: taskIds,
                });
                break;
            }
            default:
                warnings.push(`Ignored an unsupported tool: ${call.name}`);
        }
    }
    return { summary: buildSummary(actions, readOnlyResults, narrative), actions, readOnlyResults, warnings };
}
//# sourceMappingURL=ai-command.js.map