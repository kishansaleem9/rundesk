import type Anthropic from '@anthropic-ai/sdk';
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
export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';
export type StatusCategory = 'open' | 'in_progress' | 'closed';
/** A task as the planner sees it — a bounded projection of the workspace. */
export type CommandTask = {
    id: string;
    title: string;
    listId: string;
    status: string;
    statusCategory: StatusCategory;
    dueDate: string | null;
    assigneeEmails: string[];
};
export type CommandList = {
    id: string;
    name: string;
    /** Human path "Space / Project / List" for honest labels + the model catalog. */
    path: string;
};
export type CommandMember = {
    userId: string;
    email: string;
    displayName: string | null;
};
/** Everything the pure planner needs — resolved server-side from the workspace. */
export type CommandContext = {
    today: string;
    lists: CommandList[];
    members: CommandMember[];
    tasks: CommandTask[];
};
/**
 * A single MUTATING action in a plan. Args are already resolved + validated
 * server-side (assigneeEmail→assigneeId, listId/taskIds verified in-workspace),
 * so `executeActions` can act on them directly after the user confirms.
 */
export type PlanAction = {
    tool: 'create_task';
    args: {
        listId: string;
        title: string;
        priority?: TaskPriority;
        description?: string;
        dueDate?: string;
        assigneeId?: string;
        assigneeEmail?: string;
    };
    humanLabel: string;
    affectedTaskIds?: string[];
} | {
    tool: 'set_task_status';
    args: {
        taskId: string;
        status: string;
    };
    humanLabel: string;
    affectedTaskIds: string[];
} | {
    tool: 'reschedule_task';
    args: {
        taskId: string;
        dueDate: string;
    };
    humanLabel: string;
    affectedTaskIds: string[];
} | {
    tool: 'assign_task';
    args: {
        taskId: string;
        assigneeId: string;
        assigneeEmail: string;
    };
    humanLabel: string;
    affectedTaskIds: string[];
} | {
    tool: 'bulk_reschedule';
    args: {
        taskIds: string[];
        dueDate: string;
    };
    humanLabel: string;
    affectedTaskIds: string[];
};
export type CommandSearchResult = {
    query: string;
    tasks: Array<{
        id: string;
        title: string;
        status: string;
        dueDate: string | null;
        assigneeEmails: string[];
    }>;
};
/** Structured plan returned by `POST /ai/command` for the user to confirm. */
export type CommandPlan = {
    summary: string;
    actions: PlanAction[];
    /** Results of any READ-ONLY search tool calls, executed to inform the plan. */
    readOnlyResults: CommandSearchResult[];
    /** Human-readable notes about tool calls that could not be turned into actions. */
    warnings: string[];
};
export type CommandActionResult = {
    tool: PlanAction['tool'];
    humanLabel: string;
    status: 'succeeded' | 'skipped' | 'failed';
    reason?: string;
    affectedTaskIds?: string[];
};
export type CommandExecuteResult = {
    results: CommandActionResult[];
};
/** One tool call collected from the model: name + parsed input object. */
export type ToolCall = {
    name: string;
    input: Record<string, unknown>;
};
/**
 * The bounded tool set exposed to the model. Only `search_tasks` is read-only;
 * the rest are mutating and get previewed rather than executed.
 */
export declare const COMMAND_TOOLS: Anthropic.Messages.Tool[];
/**
 * Execute a READ-ONLY `search_tasks` call against the context (pure). Shared by
 * the planner (for `readOnlyResults`) and the agentic loop (to feed the model).
 */
export declare function searchTasksInContext(input: Record<string, unknown>, ctx: CommandContext): CommandTask[];
/** Resolve the set of tasks a `bulk_reschedule` filter selects (pure). */
export declare function tasksForBulkFilter(filter: Record<string, unknown>, ctx: CommandContext): CommandTask[];
/** §V2-11 — the words the audit says are worth stealing outright. */
export declare const NO_CHANGES_MADE = "No changes made.";
/**
 * PURE core (Plan §7.6/§7.8). Turn the model's tool calls into a confirmable plan:
 *  - READ-ONLY `search_tasks` calls are executed against the context → `readOnlyResults`.
 *  - MUTATING calls are validated + resolved and returned as `actions` — never executed.
 *  - Anything that can't be resolved (unknown task/list, non-member assignee) becomes a `warning`.
 */
export declare function planFromToolCalls(toolCalls: ToolCall[], ctx: CommandContext, narrative?: string): CommandPlan;
