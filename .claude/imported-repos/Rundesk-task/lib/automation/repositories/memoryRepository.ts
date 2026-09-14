/**
 * In-memory WorkflowRepository.
 *
 * Lets you run the whole engine (API routes, UI, tests) with zero database
 * setup. Data lives in Maps and is lost on restart. Two example workflows are
 * seeded so the demo page has something to fire.
 */

import { DEMO_WORKSPACE_ID } from "../taskStore";
import type { NewRun, WorkflowRepository } from "../repository";
import type { AutomationRun, Workflow, WorkflowInput } from "../types";

let counter = 0;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`;
const nowIso = () => new Date().toISOString();

/** Attach ids to a WorkflowInput to produce a persisted-looking Workflow. */
function materialize(input: WorkflowInput, id = newId("wf")): Workflow {
  const ts = nowIso();
  return {
    ...input,
    templateKey: input.templateKey ?? null,
    listId: input.listId ?? null,
    id,
    trigger: { ...input.trigger, id: newId("trg") },
    conditions: input.conditions
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((c, i) => ({ ...c, position: i, id: newId("cnd") })),
    actions: input.actions
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((a, i) => ({ ...a, position: i, id: newId("act") })),
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Example rules that ship with the prototype. */
export function seedWorkflows(): WorkflowInput[] {
  return [
    {
      workspaceId: DEMO_WORKSPACE_ID,
      name: "Urgent task completed → notify Hamda",
      description: "When an urgent task is marked Done, comment on it and ping the manager.",
      isActive: true,
      conditionLogic: "ALL",
      trigger: { type: "status_changed", config: { to: "done" } },
      conditions: [{ position: 0, field: "priority", operator: "eq", value: "urgent" }],
      actions: [
        {
          position: 0,
          type: "add_comment",
          payload: { body: "✅ Urgent task \"{{task.title}}\" was completed (moved from {{event.from}} to {{event.to}})." },
        },
        {
          position: 1,
          type: "send_notification",
          payload: { recipientId: "u_hamda", message: "Urgent task done: {{task.title}}" },
        },
      ],
    },
    {
      workspaceId: DEMO_WORKSPACE_ID,
      name: "New bug → assign to QA & bump priority",
      description: "Any new task tagged 'bug' is routed to the QA team as High priority with a 3-day due date.",
      isActive: true,
      conditionLogic: "ALL",
      trigger: { type: "task_created", config: {} },
      conditions: [
        { position: 0, field: "tags", operator: "contains", value: "bug" },
        { position: 1, field: "assigneeId", operator: "is_empty", value: null },
      ],
      actions: [
        { position: 0, type: "change_assignee", payload: { assigneeId: "u_qa" } },
        { position: 1, type: "change_priority", payload: { priority: "high" } },
        { position: 2, type: "set_due_date", payload: { days: 3 } },
      ],
    },
  ];
}

export function createMemoryRepository(seed: WorkflowInput[] = seedWorkflows()): WorkflowRepository {
  const workflows = new Map<string, Workflow>();
  const runs: AutomationRun[] = [];

  for (const input of seed) {
    const wf = materialize(input);
    workflows.set(wf.id, wf);
  }

  return {
    async findActiveWorkflowsByTrigger(type, workspaceId) {
      return [...workflows.values()].filter(
        (w) => w.isActive && w.workspaceId === workspaceId && w.trigger.type === type,
      );
    },
    async listWorkflows(workspaceId) {
      return [...workflows.values()]
        .filter((w) => w.workspaceId === workspaceId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async findByTemplate(workspaceId, templateKey, listId) {
      return [...workflows.values()].filter(
        (w) => w.workspaceId === workspaceId && w.templateKey === templateKey && (w.listId ?? null) === listId,
      );
    },
    async getWorkflow(id) {
      return workflows.get(id) ?? null;
    },
    async createWorkflow(input) {
      const wf = materialize(input);
      workflows.set(wf.id, wf);
      return wf;
    },
    async updateWorkflow(id, patch) {
      const existing = workflows.get(id);
      if (!existing) return null;
      const next = { ...existing, ...patch, updatedAt: nowIso() };
      workflows.set(id, next);
      return next;
    },
    async deleteWorkflow(id) {
      return workflows.delete(id);
    },
    async logRun(run: NewRun) {
      const saved: AutomationRun = { ...run, id: newId("run"), createdAt: nowIso() };
      runs.unshift(saved);
      return saved;
    },
    async listRuns(workspaceId, limit = 20) {
      return runs.filter((r) => r.workspaceId === workspaceId).slice(0, limit);
    },
  };
}

/**
 * Process-wide singleton (survives Next.js dev hot reloads).
 * Bump the suffix whenever the repository interface changes, otherwise a dev
 * server that is already running keeps the old object without the new methods.
 */
const g = globalThis as unknown as { __rundeskWorkflowRepo_v2?: WorkflowRepository };
export function getMemoryRepository(): WorkflowRepository {
  if (!g.__rundeskWorkflowRepo_v2) g.__rundeskWorkflowRepo_v2 = createMemoryRepository();
  return g.__rundeskWorkflowRepo_v2;
}
