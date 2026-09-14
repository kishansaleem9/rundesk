import { followUpEvent, renderTemplate, requireString, type ActionHandler } from "./registry";

/** Author id used for automation-generated comments. */
export const AUTOMATION_BOT_ID = "automation_bot";

/** Post a templated comment. Payload: `{ body: string }` (supports {{task.title}} etc). */
export const addComment: ActionHandler = {
  type: "add_comment",

  validatePayload(payload) {
    requireString(payload, "body");
  },

  async execute(payload, ctx) {
    const body = renderTemplate(requireString(payload, "body"), ctx);
    const task = await ctx.taskStore.addComment(ctx.task.id, {
      authorId: AUTOMATION_BOT_ID,
      body,
    });
    return {
      message: `Comment added: "${body}"`,
      changes: { comment: body },
      task,
      emittedEvents: [followUpEvent(ctx, "comment_added", { authorId: AUTOMATION_BOT_ID, body })],
    };
  },
};
