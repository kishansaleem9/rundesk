/**
 * The Automation Engine.
 *
 *   event ──▶ find active workflows whose TRIGGER matches
 *           ──▶ evaluate CONDITIONS (≤15) against the task
 *           ──▶ execute ACTIONS (≤6) in order
 *           ──▶ persist a run log and return RunReports
 *
 * `runEvent` is framework-agnostic: it receives its dependencies (repository +
 * task store) explicitly, so it can run inside an API route, a server action,
 * a queue worker, or a unit test with in-memory fakes.
 */

import { evaluateConditions } from "./conditions";
import { getActionHandler, toActionResult, type ActionContext } from "./actions/registry";
import type { WorkflowRepository } from "./repository";
import type { TaskStore } from "./taskStore";
import {
  MAX_ACTIONS,
  MAX_EVENT_DEPTH,
  type ActionResult,
  type AutomationEvent,
  type JsonValue,
  type RunReport,
  type Task,
  type TriggerDef,
  type Workflow,
} from "./types";

export interface EngineDeps {
  repo: WorkflowRepository;
  taskStore: TaskStore;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
}

/* ------------------------------------------------------------------ */
/* Trigger matching                                                    */
/* ------------------------------------------------------------------ */

const norm = (v: JsonValue | undefined) =>
  v === null || v === undefined ? "" : String(v).trim().toLowerCase();

/**
 * A trigger matches when every NON-EMPTY key in its config equals the same key
 * in the event payload. E.g. config `{ to: "done" }` matches payload
 * `{ from: "review", to: "done" }`. An empty config matches every event of
 * that type.
 */
export function triggerMatches(trigger: TriggerDef, event: AutomationEvent): boolean {
  if (trigger.type !== event.type) return false;
  for (const [key, expected] of Object.entries(trigger.config ?? {})) {
    if (expected === null || expected === undefined || expected === "") continue;
    if (norm(expected) !== norm(event.payload[key])) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Action execution                                                    */
/* ------------------------------------------------------------------ */

interface ExecuteOutcome {
  results: ActionResult[];
  failed: boolean;
  emitted: AutomationEvent[];
  task: Task;
}

/**
 * Run a workflow's actions sequentially (max MAX_ACTIONS). One failing action
 * is recorded and does NOT stop the remaining actions — the run is marked
 * FAILED overall so it's visible in the log.
 */
export async function executeActions(
  workflow: Workflow,
  task: Task,
  event: AutomationEvent,
  deps: Required<EngineDeps>,
): Promise<ExecuteOutcome> {
  const ordered = [...workflow.actions]
    .sort((a, b) => a.position - b.position)
    .slice(0, MAX_ACTIONS);

  const results: ActionResult[] = [];
  const emitted: AutomationEvent[] = [];
  let current = task;
  let failed = false;

  for (const action of ordered) {
    try {
      const handler = getActionHandler(action.type);
      handler.validatePayload(action.payload);

      const ctx: ActionContext = {
        task: current,
        event,
        workflowId: workflow.id,
        taskStore: deps.taskStore,
        now: deps.now,
      };
      const outcome = await handler.execute(action.payload, ctx);

      results.push(toActionResult(action.position, action.type, true, outcome.message, outcome.changes));
      if (outcome.task) current = outcome.task;
      if (outcome.emittedEvents) emitted.push(...outcome.emittedEvents);
    } catch (err) {
      failed = true;
      const message = err instanceof Error ? err.message : String(err);
      results.push(toActionResult(action.position, action.type, false, message));
    }
  }

  return { results, failed, emitted, task: current };
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

/**
 * Process one event. Returns a RunReport for every workflow whose trigger
 * matched (including SKIPPED ones whose conditions failed), plus reports from
 * any chained events emitted by actions.
 */
export async function runEvent(event: AutomationEvent, depsIn: EngineDeps): Promise<RunReport[]> {
  const deps: Required<EngineDeps> = { now: () => new Date(), ...depsIn };
  const depth = event.depth ?? 0;

  // Recursion guard: actions can emit events; never chain deeper than the cap.
  if (depth >= MAX_EVENT_DEPTH) return [];

  const candidates = await deps.repo.findActiveWorkflowsByTrigger(event.type, event.workspaceId);
  const matching = candidates.filter((w) => triggerMatches(w.trigger, event));
  if (matching.length === 0) return [];

  const reports: RunReport[] = [];
  const chained: AutomationEvent[] = [];

  for (const workflow of matching) {
    // Re-load the task for each workflow so earlier workflows' changes are seen.
    const task = await deps.taskStore.get(event.taskId);

    // List-scoped workflows (presets are "for tasks in Project X") only apply
    // to tasks in that list. Out-of-scope workflows are silently skipped.
    if (task && workflow.listId && workflow.listId !== task.listId) continue;

    const base = {
      workflowId: workflow.id,
      workflowName: workflow.name,
      eventType: event.type,
      taskId: event.taskId,
      depth,
    };

    let report: RunReport;

    if (!task) {
      report = {
        ...base,
        status: "FAILED",
        conditionsPassed: false,
        conditionResults: [],
        actionResults: [],
        error: `Task ${event.taskId} not found`,
      };
    } else {
      const verdict = evaluateConditions(workflow.conditions, task, workflow.conditionLogic);

      if (!verdict.passed) {
        report = {
          ...base,
          status: "SKIPPED",
          conditionsPassed: false,
          conditionResults: verdict.results,
          actionResults: [],
        };
      } else {
        const outcome = await executeActions(workflow, task, event, deps);
        chained.push(...outcome.emitted);
        report = {
          ...base,
          status: outcome.failed ? "FAILED" : "SUCCESS",
          conditionsPassed: true,
          conditionResults: verdict.results,
          actionResults: outcome.results,
          error: outcome.failed ? "One or more actions failed" : undefined,
        };
      }
    }

    await deps.repo.logRun({ ...report, workspaceId: event.workspaceId, eventPayload: event.payload });
    reports.push(report);
  }

  // Dispatch chained events (depth + 1) after all direct workflows have run.
  for (const next of chained) {
    reports.push(...(await runEvent(next, deps)));
  }

  return reports;
}
