import { followUpEvent, requireString, type ActionHandler } from "./registry";

/** Reassign the task. Payload: `{ assigneeId: string }`. */
export const changeAssignee: ActionHandler = {
  type: "change_assignee",

  validatePayload(payload) {
    requireString(payload, "assigneeId");
  },

  async execute(payload, ctx) {
    const assigneeId = requireString(payload, "assigneeId");
    const from = ctx.task.assigneeId;

    if (from === assigneeId) {
      return { message: `Already assigned to ${assigneeId}`, task: ctx.task };
    }

    const task = await ctx.taskStore.update(ctx.task.id, { assigneeId });
    return {
      message: `Assignee changed ${from ?? "unassigned"} → ${assigneeId}`,
      changes: { assigneeId: { from, to: assigneeId } },
      task,
      emittedEvents: [followUpEvent(ctx, "assignee_changed", { from, to: assigneeId })],
    };
  },
};
