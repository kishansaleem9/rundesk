import { describe, expect, it } from "vitest";
import { mockAiTextProvider } from "@/lib/automation/ai/provider";
import { togglePreset } from "@/lib/automation/presetService";
import { createMemoryRepository } from "@/lib/automation/repositories/memoryRepository";
import { applyTaskChange, createTask } from "@/lib/automation/taskMutations";
import { createMemoryTaskStore, DEMO_WORKSPACE_ID } from "@/lib/automation/taskStore";
import type { AutomationEvent } from "@/lib/automation/types";

const ws = DEMO_WORKSPACE_ID;
const scope = { workspaceId: ws, listId: "list_eng" };
const freshDeps = () => ({ repo: createMemoryRepository([]), taskStore: createMemoryTaskStore() });

describe("mock AI provider", () => {
  it("produces a deterministic summary from task data", async () => {
    const store = createMemoryTaskStore();
    const task = (await store.get("task_1"))!;
    const event: AutomationEvent = { type: "task_updated", workspaceId: ws, taskId: task.id, payload: {} };
    const a = await mockAiTextProvider.generate("summary", { task, event });
    const b = await mockAiTextProvider.generate("summary", { task, event });
    expect(a).toBe(b);
    expect(a).toContain('"Fix login redirect loop" is In Progress at Urgent priority, assigned to Ali');
    expect(a).toContain("tags: bug, auth");
  });

  it("describes status transitions in progress updates", async () => {
    const store = createMemoryTaskStore();
    const task = (await store.get("task_1"))!;
    const event: AutomationEvent = {
      type: "status_changed", workspaceId: ws, taskId: task.id, payload: { from: "todo", to: "in_progress" },
    };
    expect(await mockAiTextProvider.generate("progressUpdates", { task, event })).toBe("Moved from To Do to In Progress.");
  });
});

describe("AI field presets", () => {
  it("ai_summary fills the field on create and refreshes it on update", async () => {
    const deps = freshDeps();
    await togglePreset(deps.repo, "ai_summary", { ...scope, enabled: true });

    const { task } = await createTask({ workspaceId: ws, listId: "list_eng", title: "Ship v2", priority: "high" }, deps);
    expect(task.aiFields.summary).toContain('"Ship v2" is To Do at High priority');

    const updated = await applyTaskChange(task.id, { status: "done", assigneeId: "u_sara" }, deps);
    expect(updated.task.aiFields.summary).toContain("is Done at High priority, assigned to Sara");
  });

  it("does not touch AI fields when the preset is off or the task is in another list", async () => {
    const deps = freshDeps();
    await togglePreset(deps.repo, "ai_summary", { ...scope, enabled: true });
    const { task } = await createTask({ workspaceId: ws, listId: "list_design", title: "Other" }, deps);
    expect(task.aiFields.summary).toBeUndefined();
  });

  it("ai_completion_deadline reflects overdue tasks", async () => {
    const deps = freshDeps();
    await togglePreset(deps.repo, "ai_completion_deadline", { workspaceId: ws, listId: "list_marketing", enabled: true });
    const { task } = await applyTaskChange("task_6", { priority: "urgent" }, deps); // task_6 is 1 day overdue
    expect(task.aiFields.completionDeadline).toMatch(/Overdue by 1 day/);
  });
});
