import type { ActionHandler } from "./registry";

/**
 * Set the due date. Payload: `{ days?: number, date?: string }`.
 * - `date` (ISO / yyyy-mm-dd) wins if provided.
 * - otherwise `days` is added to "now".
 */
export const setDueDate: ActionHandler = {
  type: "set_due_date",

  validatePayload(payload) {
    const hasDate = typeof payload.date === "string" && payload.date !== "";
    const days = payload.days;
    const hasDays =
      (typeof days === "number" && Number.isFinite(days)) ||
      (typeof days === "string" && days.trim() !== "" && !Number.isNaN(Number(days)));
    if (!hasDate && !hasDays) throw new Error('Provide either "days" or "date"');
    if (hasDate && Number.isNaN(new Date(String(payload.date)).getTime())) {
      throw new Error(`Invalid date "${payload.date}"`);
    }
  },

  async execute(payload, ctx) {
    let target: Date;
    if (typeof payload.date === "string" && payload.date !== "") {
      target = new Date(payload.date);
    } else {
      target = new Date(ctx.now().getTime() + Number(payload.days) * 86400_000);
    }
    const dueDate = target.toISOString();
    const from = ctx.task.dueDate;

    const task = await ctx.taskStore.update(ctx.task.id, { dueDate });
    return {
      message: `Due date set to ${dueDate.slice(0, 10)}`,
      changes: { dueDate: { from, to: dueDate } },
      task,
    };
  },
};
