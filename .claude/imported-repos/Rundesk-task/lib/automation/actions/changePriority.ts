import { followUpEvent, requireString, type ActionHandler } from "./registry";

/** Set the task priority. Payload: `{ priority: string }`. */
export const changePriority: ActionHandler = {
  type: "change_priority",

  validatePayload(payload) {
    requireString(payload, "priority");
  },

  async execute(payload, ctx) {
    const priority = requireString(payload, "priority");
    const from = ctx.task.priority;

    if (from === priority) {
      return { message: `Priority already "${priority}"`, task: ctx.task };
    }

    const task = await ctx.taskStore.update(ctx.task.id, { priority });
    return {
      message: `Priority changed ${from} → ${priority}`,
      changes: { priority: { from, to: priority } },
      task,
      emittedEvents: [followUpEvent(ctx, "priority_changed", { from, to: priority })],
    };
  },
};
