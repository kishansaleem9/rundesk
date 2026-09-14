import { describe, expect, it } from "vitest";
import { runEvent, triggerMatches } from "@/lib/automation/engine";
import { createMemoryRepository } from "@/lib/automation/repositories/memoryRepository";
import { createMemoryTaskStore, DEMO_WORKSPACE_ID } from "@/lib/automation/taskStore";
import { MAX_EVENT_DEPTH, type WorkflowInput } from "@/lib/automation/types";

const ws = DEMO_WORKSPACE_ID;
const freshDeps = (seed?: WorkflowInput[]) => ({
  repo: createMemoryRepository(seed),
  taskStore: createMemoryTaskStore(),
  now: () => new Date("2026-09-03T12:00:00.000Z"),
});

describe("triggerMatches", () => {
  const trigger = { type: "status_changed" as const, config: { to: "done", from: "" } };
  const ev = (payload: Record<string, string>) => ({ type: "status_changed" as const, workspaceId: ws, taskId: "task_1", payload });

  it("matches when non-empty config keys equal payload keys", () => {
    expect(triggerMatches(trigger, ev({ from: "review", to: "done" }))).toBe(true);
  });
  it("ignores empty config keys", () => {
    expect(triggerMatches(trigger, ev({ from: "anything", to: "DONE" }))).toBe(true);
  });
  it("fails on mismatch or different type", () => {
    expect(triggerMatches(trigger, ev({ to: "review" }))).toBe(false);
    expect(triggerMatches({ type: "task_created", config: {} }, ev({ to: "done" }))).toBe(false);
  });
});

describe("runEvent with seeded workflows", () => {
  it("fires 'urgent task completed' for an urgent task moved to done", async () => {
    const deps = freshDeps();
    const reports = await runEvent(
      { type: "status_changed", workspaceId: ws, taskId: "task_1", payload: { from: "in_progress", to: "done" } },
      deps,
    );

    const main = reports.find((r) => r.depth === 0)!;
    expect(main.status).toBe("SUCCESS");
    expect(main.conditionsPassed).toBe(true);
    expect(main.actionResults.map((a) => a.type)).toEqual(["add_comment", "send_notification"]);

    const task = (await deps.taskStore.get("task_1"))!;
    expect(task.comments[0].body).toContain("Fix login redirect loop");
    expect(task.comments[0].body).toContain("in_progress to done");

    const notes = await deps.taskStore.listNotifications(ws);
    expect(notes[0]).toMatchObject({ recipientId: "u_hamda" });

    const runs = await deps.repo.listRuns(ws);
    expect(runs.some((r) => r.status === "SUCCESS" && r.workflowId === main.workflowId)).toBe(true);
  });

  it("skips (and logs) when conditions fail", async () => {
    const deps = freshDeps();
    // task_2 is priority "normal", so the urgent-only rule must not run its actions.
    const reports = await runEvent(
      { type: "status_changed", workspaceId: ws, taskId: "task_2", payload: { from: "todo", to: "done" } },
      deps,
    );
    expect(reports).toHaveLength(1);
    expect(reports[0].status).toBe("SKIPPED");
    expect(reports[0].conditionResults[0]).toMatchObject({ field: "priority", passed: false, actual: "normal" });
    expect((await deps.taskStore.get("task_2"))!.comments).toHaveLength(0);
    expect((await deps.repo.listRuns(ws))[0].status).toBe("SKIPPED");
  });

  it("returns nothing when the trigger config does not match", async () => {
    const deps = freshDeps();
    const reports = await runEvent(
      { type: "status_changed", workspaceId: ws, taskId: "task_1", payload: { from: "todo", to: "review" } },
      deps,
    );
    expect(reports).toEqual([]);
  });

  it("routes a new unassigned bug to QA with high priority and a due date", async () => {
    const deps = freshDeps();
    const reports = await runEvent(
      { type: "task_created", workspaceId: ws, taskId: "task_3", payload: { listId: "list_eng" } },
      deps,
    );
    const main = reports.find((r) => r.depth === 0)!;
    expect(main.status).toBe("SUCCESS");

    const task = (await deps.taskStore.get("task_3"))!;
    expect(task.assigneeId).toBe("u_qa");
    expect(task.priority).toBe("high");
    expect(task.dueDate).toBe("2026-09-06T12:00:00.000Z");
  });

  it("does not fire inactive workflows", async () => {
    const deps = freshDeps();
    const [wf] = await deps.repo.listWorkflows(ws);
    await deps.repo.updateWorkflow(wf.id, { isActive: false });
    const reports = await runEvent(
      { type: "status_changed", workspaceId: ws, taskId: "task_1", payload: { to: "done" } },
      deps,
    );
    expect(reports).toEqual([]);
  });

  it("reports FAILED when the task does not exist", async () => {
    const deps = freshDeps();
    const reports = await runEvent(
      { type: "status_changed", workspaceId: ws, taskId: "missing", payload: { to: "done" } },
      deps,
    );
    expect(reports[0].status).toBe("FAILED");
    expect(reports[0].error).toMatch(/not found/);
  });
});

describe("list scoping", () => {
  it("a list-scoped workflow only fires for tasks in that list", async () => {
    const scoped: WorkflowInput = {
      workspaceId: ws, name: "design only", isActive: true, conditionLogic: "ALL", listId: "list_design",
      trigger: { type: "priority_changed", config: {} }, conditions: [],
      actions: [{ position: 0, type: "add_comment", payload: { body: "scoped" } }],
    };
    const deps = freshDeps([scoped]);
    const ev = (taskId: string) => ({ type: "priority_changed" as const, workspaceId: ws, taskId, payload: { to: "high" } });

    expect(await runEvent(ev("task_1"), deps)).toEqual([]); // task_1 is in list_eng
    const reports = await runEvent(ev("task_4"), deps); // task_4 is in list_design
    expect(reports).toHaveLength(1);
    expect(reports[0].status).toBe("SUCCESS");
    expect((await deps.repo.listRuns(ws))).toHaveLength(1); // out-of-scope skip is not logged
  });
});

describe("chained events and recursion guard", () => {
  it("lets one automation trigger another, bounded by MAX_EVENT_DEPTH", async () => {
    // A: to=review → set done.  B: to=done → set review.  Would ping-pong forever.
    const pingPong: WorkflowInput[] = [
      {
        workspaceId: ws, name: "A", isActive: true, conditionLogic: "ALL",
        trigger: { type: "status_changed", config: { to: "review" } }, conditions: [],
        actions: [{ position: 0, type: "change_status", payload: { status: "done" } }],
      },
      {
        workspaceId: ws, name: "B", isActive: true, conditionLogic: "ALL",
        trigger: { type: "status_changed", config: { to: "done" } }, conditions: [],
        actions: [{ position: 0, type: "change_status", payload: { status: "review" } }],
      },
    ];
    const deps = freshDeps(pingPong);
    const reports = await runEvent(
      { type: "status_changed", workspaceId: ws, taskId: "task_1", payload: { from: "todo", to: "review" } },
      deps,
    );

    expect(reports.length).toBe(MAX_EVENT_DEPTH); // depth 0, 1, 2 — then stops
    expect(reports.map((r) => r.workflowName)).toEqual(["A", "B", "A"]);
    expect(Math.max(...reports.map((r) => r.depth))).toBe(MAX_EVENT_DEPTH - 1);
  });
});
