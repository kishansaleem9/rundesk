import { describe, expect, it } from "vitest";
import { PRESETS } from "@/lib/automation/presets";
import { getPresetStates, togglePreset } from "@/lib/automation/presetService";
import { createMemoryRepository } from "@/lib/automation/repositories/memoryRepository";
import { createTask, applyTaskChange } from "@/lib/automation/taskMutations";
import { createMemoryTaskStore, DEMO_WORKSPACE_ID } from "@/lib/automation/taskStore";
import { workflowInputSchema } from "@/lib/automation/validation";

const ws = DEMO_WORKSPACE_ID;
const scope = { workspaceId: ws, listId: "list_eng" };

/** Fresh engine deps with NO seeded workflows so only presets are in play. */
const freshDeps = () => ({ repo: createMemoryRepository([]), taskStore: createMemoryTaskStore() });

/** Params that satisfy every preset's requirements. */
const anyParams = { assigneeId: "u_qa", followerId: "u_hamda", recipientId: "u_ali" };

describe("preset catalogue", () => {
  it("has the 10 cards from the ClickUp panel", () => {
    expect(PRESETS.filter((p) => p.section === "ai_fields")).toHaveLength(5);
    expect(PRESETS.filter((p) => p.section === "automations")).toHaveLength(5);
  });

  it("every preset builds workflows that pass API validation and carry scope", () => {
    for (const p of PRESETS) {
      const inputs = p.build(scope, anyParams);
      expect(inputs.length).toBeGreaterThan(0);
      for (const wf of inputs) {
        expect(() => workflowInputSchema.parse(wf)).not.toThrow();
        expect(wf.templateKey).toBe(p.key);
        expect(wf.listId).toBe("list_eng");
      }
    }
  });

  it("presets with params reject missing values", () => {
    const auto = PRESETS.find((p) => p.key === "auto_assign")!;
    expect(() => auto.build(scope, {})).toThrow(/assigneeId/);
  });
});

describe("togglePreset / getPresetStates", () => {
  it("turning auto_assign on assigns new tasks in that list only", async () => {
    const deps = freshDeps();
    const state = await togglePreset(deps.repo, "auto_assign", { ...scope, enabled: true, params: { assigneeId: "u_qa" } });
    expect(state.active).toBe(true);
    expect(state.workflowIds).toHaveLength(1);

    const inList = await createTask({ workspaceId: ws, listId: "list_eng", title: "New eng task" }, deps);
    expect(inList.task.assigneeId).toBe("u_qa");
    expect(inList.reports[0]).toMatchObject({ status: "SUCCESS", workflowName: "Auto assign" });

    const other = await createTask({ workspaceId: ws, listId: "list_design", title: "New design task" }, deps);
    expect(other.task.assigneeId).toBeNull();
    expect(other.reports).toEqual([]);
  });

  it("turning off pauses (no run) and turning on again reuses the same workflows", async () => {
    const deps = freshDeps();
    const on = await togglePreset(deps.repo, "auto_follow", { ...scope, enabled: true, params: { followerId: "u_hamda" } });
    const off = await togglePreset(deps.repo, "auto_follow", { ...scope, enabled: false });
    expect(off.active).toBe(false);
    expect(off.workflowIds).toEqual(on.workflowIds); // kept, just paused

    const paused = await createTask({ workspaceId: ws, listId: "list_eng", title: "t" }, deps);
    expect(paused.task.followers).toEqual([]);

    const again = await togglePreset(deps.repo, "auto_follow", { ...scope, enabled: true });
    expect(again.workflowIds).toEqual(on.workflowIds);
    const resumed = await createTask({ workspaceId: ws, listId: "list_eng", title: "t2" }, deps);
    expect(resumed.task.followers).toEqual(["u_hamda"]);
  });

  it("re-enabling with new params replaces the configuration", async () => {
    const deps = freshDeps();
    await togglePreset(deps.repo, "auto_assign", { ...scope, enabled: true, params: { assigneeId: "u_qa" } });
    await togglePreset(deps.repo, "auto_assign", { ...scope, enabled: true, params: { assigneeId: "u_sara" } });
    const wfs = await deps.repo.findByTemplate(ws, "auto_assign", "list_eng");
    expect(wfs).toHaveLength(1);
    expect(wfs[0].actions[0].payload).toEqual({ assigneeId: "u_sara" });
  });

  it("getPresetStates reports active flags and total count", async () => {
    const deps = freshDeps();
    await togglePreset(deps.repo, "ai_summary", { ...scope, enabled: true });
    await togglePreset(deps.repo, "notify_when_project_complete", { ...scope, enabled: true, params: { recipientId: "u_ali" } });
    // A custom (non-preset) rule scoped to the list also counts.
    await deps.repo.createWorkflow({
      workspaceId: ws, listId: "list_eng", name: "custom", isActive: true, conditionLogic: "ALL",
      trigger: { type: "comment_added", config: {} }, conditions: [],
      actions: [{ position: 0, type: "add_comment", payload: { body: "x" } }],
    });

    const state = await getPresetStates(deps.repo, ws, "list_eng");
    expect(state.presets.find((p) => p.key === "ai_summary")?.active).toBe(true);
    expect(state.presets.find((p) => p.key === "auto_assign")?.active).toBe(false);
    expect(state.totalActive).toBe(3); // ai_summary + notify + custom (ai_summary's 3 workflows count once)

    const otherList = await getPresetStates(deps.repo, ws, "list_design");
    expect(otherList.totalActive).toBe(0);
  });

  it("notify_when_project_complete notifies when a task in the list is marked done", async () => {
    const deps = freshDeps();
    await togglePreset(deps.repo, "notify_when_project_complete", { ...scope, enabled: true, params: { recipientId: "u_hamda" } });
    await applyTaskChange("task_1", { status: "done" }, deps);
    const notes = await deps.taskStore.listNotifications(ws);
    expect(notes[0]).toMatchObject({ recipientId: "u_hamda", message: '✅ "Fix login redirect loop" is complete.' });
  });

  it("unknown preset key throws", async () => {
    const deps = freshDeps();
    await expect(togglePreset(deps.repo, "nope", { ...scope, enabled: true })).rejects.toThrow(/Unknown preset/);
  });
});
