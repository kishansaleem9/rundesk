import { followUpEvent, requireString, type ActionHandler } from "./registry";

/** Move the task to a new status. Payload: `{ status: string }`. */
export const changeStatus: ActionHandler = {
  type: "change_status",

  validatePayload(payload) {
    requireString(payload, "status");
  },

  async execute(payload, ctx) {
    const status = requireString(payload, "status");
    const from = ctx.task.status;

    if (from === status) {
      return { message: `Status already "${status}"`, task: ctx.task };
    }

    const task = await ctx.taskStore.update(ctx.task.id, { status });
    return {
      message: `Status changed ${from} → ${status}`,
      changes: { status: { from, to: status } },
      task,
      // Lets other "status changes" automations react (bounded by MAX_EVENT_DEPTH).
      emittedEvents: [followUpEvent(ctx, "status_changed", { from, to: status })],
    };
  },
};
