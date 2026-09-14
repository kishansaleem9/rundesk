import { getAiTextProvider } from "../ai/provider";
import { AI_FIELD_KEYS, type AiFieldKey } from "../types";
import { requireString, type ActionHandler } from "./registry";

/**
 * (Re)generate one AI custom field. Payload: `{ field: AiFieldKey }`.
 * Text comes from the configured AiTextProvider (mock by default).
 */
export const updateAiField: ActionHandler = {
  type: "update_ai_field",

  validatePayload(payload) {
    const field = requireString(payload, "field");
    if (!(AI_FIELD_KEYS as readonly string[]).includes(field)) {
      throw new Error(`Unknown AI field "${field}"`);
    }
  },

  async execute(payload, ctx) {
    const field = requireString(payload, "field") as AiFieldKey;
    const text = await getAiTextProvider().generate(field, { task: ctx.task, event: ctx.event });

    const task = await ctx.taskStore.update(ctx.task.id, {
      aiFields: { ...ctx.task.aiFields, [field]: text },
    });
    return {
      message: `AI field "${field}" updated: ${text}`,
      changes: { aiField: { field, text } },
      task,
    };
  },
};
