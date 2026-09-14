import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "@/lib/automation/repositories/memoryRepository";
import { applyTaskChange, createTask } from "@/lib/automation/taskMutations";
import { createMemoryTaskStore, DEMO_WORKSPACE_ID } from "@/lib/automation/taskStore";
import type { AutomationEvent, WorkflowInput } from "@/lib/automation/types";

const ws = DEMO_WORKSPACE_ID;

/** One "recorder" workflow per trigger type so we can see which events fired. */
const recorders: WorkflowInput[] = (
  ["task_created", "status_changed", "priority_changed", "assignee_changed", "task_updated"] as const
).map((t) => ({
  workspaceId: ws, name: `rec:${t}`, isActive: true, conditionLogic: "ALL",
  trigger: { type: t, config: {} }, conditions: [],
  actions: [{ position: 0, type: "add_comment", payload: { body: `${t}:{{event.from}}>{{event.to}}` } }],
}));

const freshDeps = () => ({ repo: createMemoryRepository(recorders), taskStore: createMemoryTaskStore() });

describe("applyTaskChange", () => {
  it("emits one specific event per changed field plus a single task_updated", async () => {
    const deps = freshDeps();
    const { task, reports } = await applyTaskChange("task_2", { status: "in_progress", priority: "high" }, deps);

    const fired = reports.filter((r) => r.depth === 0).map((r) => r.eventType);
    expect(fired).toEqual(["status_changed", "priority_changed", "task_updated"]);

    const bodies = task.comments.map((c) => c.body);
    expect(bodies).toContain("status_changed:todo>in_progress");
    expect(bodies).toContain("priority_changed:normal>high");
    expect(bodies.some((b) => b.startsWith("task_updated:"))).toBe(true);
  });

  it("ignores no-op patches", async () => {
    const deps = freshDeps();
    const before = (await deps.taskStore.get("task_2"))!;
    const { reports } = await applyTaskChange("task_2", { status: before.status, title: before.title }, deps);
    expect(reports).toEqual([]);
  });

  it("emits assignee_changed with null → user", async () => {
    const deps = freshDeps();
    const { reports } = await applyTaskChange("task_2", { assigneeId: "u_ali" }, deps);
    const ev = reports.find((r) => r.eventType === "assignee_changed")!;
    expect(ev.status).toBe("SUCCESS");
    const task = (await deps.taskStore.get("task_2"))!;
    expect(task.comments.map((c) => c.body)).toContain("assignee_changed:>u_ali");
  });

  it("throws for unknown task", async () => {
    await expect(applyTaskChange("missing", { status: "done" }, freshDeps())).rejects.toThrow(/not found/);
  });
});

describe("createTask", () => {
  it("creates the task and emits task_created with the list id", async () => {
    const deps = freshDeps();
    const { task, reports } = await createTask({ workspaceId: ws, listId: "list_design", title: "Hello" }, deps);
    expect(task.id).toMatch(/^task_/);
    expect(task.listId).toBe("list_design");
    expect(reports.map((r) => r.eventType)).toEqual(["task_created"]);
    expect(task.comments[0].body).toBe("task_created:>");
  });
});

// Type guard so the file also documents the event payload contract.
const _example: AutomationEvent = { type: "task_updated", workspaceId: ws, taskId: "x", payload: { changed: ["status"] } };
void _example;
