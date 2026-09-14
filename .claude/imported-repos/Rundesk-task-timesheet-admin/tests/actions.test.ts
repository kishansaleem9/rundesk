import { describe, expect, it } from "vitest";
import { ACTION_HANDLERS, renderTemplate, type ActionContext } from "@/lib/automation/actions/registry";
import { executeActions } from "@/lib/automation/engine";
import { createMemoryTaskStore } from "@/lib/automation/taskStore";
import { MAX_ACTIONS, type AutomationEvent, type Workflow } from "@/lib/automation/types";

const event: AutomationEvent = {
  type: "status_changed",
  workspaceId: "ws_aura",
  taskId: "task_1",
  payload: { from: "review", to: "done" },
};

const fixedNow = () => new Date("2026-09-03T12:00:00.000Z");

async function ctxFor(taskId = "task_1"): Promise<ActionContext> {
  const taskStore = createMemoryTaskStore();
  const task = (await taskStore.get(taskId))!;
  return { task, event, workflowId: "wf_test", taskStore, now: fixedNow };
}

describe("renderTemplate", () => {
  it("fills task and event placeholders, blanks unknown ones", async () => {
    const ctx = await ctxFor();
    const out = renderTemplate("{{task.title}} moved {{event.from}}→{{ event.to }} tags={{task.tags}} x={{nope}}", ctx);
    expect(out).toBe("Fix login redirect loop moved review→done tags=bug, auth x=");
  });
});

describe("action handlers", () => {
  it("change_assignee updates the task and emits assignee_changed", async () => {
    const ctx = await ctxFor();
    const out = await ACTION_HANDLERS.change_assignee.execute({ assigneeId: "u_qa" }, ctx);
    expect(out.task?.assigneeId).toBe("u_qa");
    expect(out.emittedEvents?.[0]).toMatchObject({ type: "assignee_changed", depth: 1, payload: { to: "u_qa" } });
    expect((await ctx.taskStore.get("task_1"))?.assigneeId).toBe("u_qa");
  });

  it("change_status is a no-op (no event) when status is unchanged", async () => {
    const ctx = await ctxFor();
    const out = await ACTION_HANDLERS.change_status.execute({ status: ctx.task.status }, ctx);
    expect(out.emittedEvents).toBeUndefined();
  });

  it("add_comment renders the template and stores the comment", async () => {
    const ctx = await ctxFor();
    const out = await ACTION_HANDLERS.add_comment.execute({ body: "Done: {{task.title}}" }, ctx);
    expect(out.task?.comments[0].body).toBe("Done: Fix login redirect loop");
  });

  it("send_notification writes to the notification list", async () => {
    const ctx = await ctxFor();
    await ACTION_HANDLERS.send_notification.execute({ recipientId: "u_hamda", message: "{{task.title}}" }, ctx);
    const list = await ctx.taskStore.listNotifications("ws_aura");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ recipientId: "u_hamda", message: "Fix login redirect loop" });
  });

  it("set_due_date uses the injected clock for relative days", async () => {
    const ctx = await ctxFor();
    const out = await ACTION_HANDLERS.set_due_date.execute({ days: 3 }, ctx);
    expect(out.task?.dueDate).toBe("2026-09-06T12:00:00.000Z");
  });

  it("validatePayload rejects missing fields", () => {
    expect(() => ACTION_HANDLERS.change_assignee.validatePayload({})).toThrow(/assigneeId/);
    expect(() => ACTION_HANDLERS.set_due_date.validatePayload({})).toThrow(/days.*date/);
    expect(() => ACTION_HANDLERS.set_due_date.validatePayload({ date: "not-a-date" })).toThrow(/Invalid date/);
  });
});

describe("executeActions", () => {
  const baseWorkflow = (actions: Workflow["actions"]): Workflow => ({
    id: "wf",
    workspaceId: "ws_aura",
    name: "wf",
    isActive: true,
    conditionLogic: "ALL",
    trigger: { id: "t", type: "status_changed", config: {} },
    conditions: [],
    actions,
    createdAt: "",
    updatedAt: "",
  });

  it("continues after a failing action and marks the run failed", async () => {
    const taskStore = createMemoryTaskStore();
    const task = (await taskStore.get("task_1"))!;
    const wf = baseWorkflow([
      { id: "a0", position: 0, type: "change_assignee", payload: {} }, // invalid → fails
      { id: "a1", position: 1, type: "change_priority", payload: { priority: "low" } },
    ]);

    const out = await executeActions(wf, task, event, { repo: null as never, taskStore, now: fixedNow });
    expect(out.failed).toBe(true);
    expect(out.results.map((r) => r.ok)).toEqual([false, true]);
    expect(out.task.priority).toBe("low");
  });

  it(`runs at most ${MAX_ACTIONS} actions`, async () => {
    const taskStore = createMemoryTaskStore();
    const task = (await taskStore.get("task_1"))!;
    const actions = Array.from({ length: 10 }, (_, i) => ({
      id: `a${i}`,
      position: i,
      type: "add_comment" as const,
      payload: { body: `c${i}` },
    }));
    const out = await executeActions(baseWorkflow(actions), task, event, { repo: null as never, taskStore, now: fixedNow });
    expect(out.results).toHaveLength(MAX_ACTIONS);
    expect(out.task.comments).toHaveLength(MAX_ACTIONS);
  });

  it("feeds each action the task as modified by the previous one", async () => {
    const taskStore = createMemoryTaskStore();
    const task = (await taskStore.get("task_1"))!;
    const wf = baseWorkflow([
      { id: "a0", position: 0, type: "change_status", payload: { status: "done" } },
      { id: "a1", position: 1, type: "add_comment", payload: { body: "now {{task.status}}" } },
    ]);
    const out = await executeActions(wf, task, event, { repo: null as never, taskStore, now: fixedNow });
    expect(out.task.comments[0].body).toBe("now done");
  });
});
