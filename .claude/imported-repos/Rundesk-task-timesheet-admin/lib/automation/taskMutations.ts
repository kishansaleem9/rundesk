/**
 * Task mutations that EMIT automation events.
 *
 * This is the integration hook for Rundesk: wherever the host app creates or
 * edits a task, route the change through `createTask` / `applyTaskChange`
 * (or replicate the diff → events logic) and every matching workflow runs.
 */

import { runEvent, type EngineDeps } from "./engine";
import type { AutomationEvent, JsonObject, NewTaskInput, RunReport, Task, TaskPatch } from "./types";

export interface MutationResult {
  task: Task;
  reports: RunReport[];
}

/** Create a task and fire `task_created`. */
export async function createTask(input: NewTaskInput, deps: EngineDeps): Promise<MutationResult> {
  const created = await deps.taskStore.create(input);

  const reports = await runEvent(
    { type: "task_created", workspaceId: created.workspaceId, taskId: created.id, payload: { listId: created.listId } },
    deps,
  );

  const task = (await deps.taskStore.get(created.id)) ?? created;
  return { task, reports };
}

/** Fields whose change emits a dedicated event in addition to `task_updated`. */
const SPECIFIC_EVENTS: Partial<Record<keyof TaskPatch, AutomationEvent["type"]>> = {
  status: "status_changed",
  priority: "priority_changed",
  assigneeId: "assignee_changed",
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Apply a partial update, then emit one specific event per changed field
 * (status_changed, priority_changed, assignee_changed) followed by a single
 * `task_updated` event listing everything that changed.
 */
export async function applyTaskChange(taskId: string, patch: TaskPatch, deps: EngineDeps): Promise<MutationResult> {
  const before = await deps.taskStore.get(taskId);
  if (!before) throw new Error(`Task ${taskId} not found`);

  // Only keep fields that actually differ.
  const changed = (Object.keys(patch) as (keyof TaskPatch)[]).filter(
    (k) => patch[k] !== undefined && !same(patch[k], before[k]),
  );
  if (changed.length === 0) return { task: before, reports: [] };

  const effective: TaskPatch = {};
  for (const k of changed) (effective as Record<string, unknown>)[k] = patch[k];
  const after = await deps.taskStore.update(taskId, effective);

  const reports: RunReport[] = [];
  const base = { workspaceId: after.workspaceId, taskId };

  for (const key of changed) {
    const type = SPECIFIC_EVENTS[key];
    if (!type) continue;
    const payload: JsonObject = { from: before[key] as string | null, to: after[key] as string | null };
    reports.push(...(await runEvent({ ...base, type, payload }, deps)));
  }

  reports.push(...(await runEvent({ ...base, type: "task_updated", payload: { changed } }, deps)));

  const task = (await deps.taskStore.get(taskId)) ?? after;
  return { task, reports };
}
