/**
 * Zod schemas used by the API routes to validate incoming JSON.
 * These enforce the same limits (15 conditions / 6 actions) as the engine and
 * check action payloads against their handlers before anything is saved.
 */

import { z } from "zod";
import { getActionHandler } from "./actions/registry";
import {
  ACTION_TYPES,
  CONDITION_FIELDS,
  CONDITION_OPERATORS,
  MAX_ACTIONS,
  MAX_CONDITIONS,
  TRIGGER_TYPES,
  type JsonObject,
  type JsonValue,
} from "./types";

/** Recursive JSON schema (what a MySQL JSON column can store). */
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);
export const jsonObjectSchema: z.ZodType<JsonObject> = z.record(z.string(), jsonValueSchema);

export const triggerSchema = z.object({
  type: z.enum(TRIGGER_TYPES),
  config: jsonObjectSchema.default({}),
});

export const conditionSchema = z.object({
  position: z.number().int().min(0),
  field: z.enum(CONDITION_FIELDS),
  operator: z.enum(CONDITION_OPERATORS),
  value: jsonValueSchema.default(null),
});

export const actionSchema = z
  .object({
    position: z.number().int().min(0),
    type: z.enum(ACTION_TYPES),
    payload: jsonObjectSchema.default({}),
  })
  // Ask the handler itself whether the payload is well-formed.
  .superRefine((action, ctx) => {
    try {
      getActionHandler(action.type).validatePayload(action.payload);
    } catch (err) {
      ctx.addIssue({
        code: "custom",
        path: ["payload"],
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

export const workflowInputSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().max(500).optional(),
  isActive: z.boolean().default(true),
  templateKey: z.string().max(64).nullable().optional(),
  listId: z.string().max(64).nullable().optional(),
  conditionLogic: z.enum(["ALL", "ANY"]).default("ALL"),
  trigger: triggerSchema,
  conditions: z.array(conditionSchema).max(MAX_CONDITIONS, `Max ${MAX_CONDITIONS} conditions`),
  actions: z
    .array(actionSchema)
    .min(1, "At least one action is required")
    .max(MAX_ACTIONS, `Max ${MAX_ACTIONS} actions`),
});

export const workflowPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(500),
    isActive: z.boolean(),
    conditionLogic: z.enum(["ALL", "ANY"]),
  })
  .partial();

export const eventSchema = z.object({
  type: z.enum(TRIGGER_TYPES),
  workspaceId: z.string().min(1),
  taskId: z.string().min(1),
  payload: jsonObjectSchema.default({}),
  depth: z.number().int().min(0).optional(),
});

/** Body of POST /api/automations/presets/[key]. */
export const presetToggleSchema = z.object({
  workspaceId: z.string().min(1),
  listId: z.string().min(1),
  enabled: z.boolean(),
  params: z.record(z.string(), z.string()).default({}),
});

/** Body of PATCH /api/automations/tasks/[id]. */
export const taskPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    status: z.string().min(1),
    priority: z.string().min(1),
    assigneeId: z.string().nullable(),
    tags: z.array(z.string()),
    dueDate: z.string().nullable(),
    listId: z.string().min(1),
  })
  .partial();

/** Body of POST /api/automations/tasks. */
export const taskCreateSchema = z.object({
  workspaceId: z.string().min(1),
  listId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  status: z.string().optional(),
  priority: z.string().optional(),
  assigneeId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  dueDate: z.string().nullable().optional(),
});

export type WorkflowInputParsed = z.infer<typeof workflowInputSchema>;
export type EventParsed = z.infer<typeof eventSchema>;
