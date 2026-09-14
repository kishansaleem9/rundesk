import { requireString, type ActionHandler } from "./registry";

/** Add a teammate as a follower/watcher. Payload: `{ followerId: string }`. */
export const addFollower: ActionHandler = {
  type: "add_follower",

  validatePayload(payload) {
    requireString(payload, "followerId");
  },

  async execute(payload, ctx) {
    const followerId = requireString(payload, "followerId");

    if (ctx.task.followers.includes(followerId)) {
      return { message: `${followerId} already follows this task`, task: ctx.task };
    }

    const task = await ctx.taskStore.update(ctx.task.id, {
      followers: [...ctx.task.followers, followerId],
    });
    return {
      message: `Added follower ${followerId}`,
      changes: { followers: { added: followerId } },
      task,
    };
  },
};
