import { renderTemplate, requireString, type ActionHandler } from "./registry";

/**
 * Notify a teammate. Payload: `{ recipientId: string, message: string }`.
 * In the prototype this writes to the mock notification list; in Rundesk it
 * would call the real notification/inbox service.
 */
export const sendNotification: ActionHandler = {
  type: "send_notification",

  validatePayload(payload) {
    requireString(payload, "recipientId");
    requireString(payload, "message");
  },

  async execute(payload, ctx) {
    const recipientId = requireString(payload, "recipientId");
    const message = renderTemplate(requireString(payload, "message"), ctx);

    await ctx.taskStore.notify({
      workspaceId: ctx.task.workspaceId,
      recipientId,
      taskId: ctx.task.id,
      message,
    });

    return {
      message: `Notified ${recipientId}: "${message}"`,
      changes: { notification: { recipientId, message } },
      task: ctx.task,
    };
  },
};
