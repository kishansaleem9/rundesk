/**
 * Action handler registry.
 *
 * Each action type has one handler implementing `ActionHandler`. Handlers are
 * small, isolated and only talk to the `TaskStore`, so wiring them to real
 * Rundesk services later is a matter of swapping the store.
 *
 * Handlers may return `emittedEvents` (e.g. change_status emits
 * `status_changed`) which the engine re-dispatches with depth + 1, so
 * automations can chain safely up to MAX_EVENT_DEPTH.
 */

import type { TaskStore } from "../taskStore";
import type {
  ActionResult,
  ActionType,
  AutomationEvent,
  JsonObject,
  JsonValue,
  Task,
} from "../types";

export interface ActionContext {
  task: Task;
  event: AutomationEvent;
  workflowId: string;
  taskStore: TaskStore;
  now: () => Date;
}

export interface HandlerOutcome {
  message: string;
  changes?: JsonObject;
  /** Follow-up events for chained automations. */
  emittedEvents?: AutomationEvent[];
  /** The task after this action (engine feeds it to the next action). */
  task?: Task;
}

export interface ActionHandler {
  type: ActionType;
  /** Throw a descriptive Error if the payload is malformed. */
  validatePayload(payload: JsonObject): void;
  execute(payload: JsonObject, ctx: ActionContext): Promise<HandlerOutcome>;
}

/* ---------- shared helpers for handlers ---------- */

export function requireString(payload: JsonObject, key: string): string {
  const v = payload[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`Payload field "${key}" is required`);
  }
  return v;
}

/**
 * Tiny template renderer: replaces {{task.title}}, {{event.to}}, etc.
 * Unknown placeholders render as an empty string.
 */
export function renderTemplate(template: string, ctx: { task: Task; event: AutomationEvent }): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const [root, ...rest] = path.split(".");
    let cur: unknown =
      root === "task" ? ctx.task : root === "event" ? ctx.event.payload : undefined;
    for (const key of rest) {
      if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[key];
      else cur = undefined;
    }
    if (cur === null || cur === undefined) return "";
    return Array.isArray(cur) ? cur.join(", ") : String(cur as JsonValue);
  });
}

/** Build a follow-up event from an action so chains keep the same task/workspace. */
export function followUpEvent(
  ctx: ActionContext,
  type: AutomationEvent["type"],
  payload: JsonObject,
): AutomationEvent {
  return {
    type,
    workspaceId: ctx.task.workspaceId,
    taskId: ctx.task.id,
    payload,
    depth: (ctx.event.depth ?? 0) + 1,
  };
}

/* ---------- registry ---------- */

import { changeAssignee } from "./changeAssignee";
import { changeStatus } from "./changeStatus";
import { changePriority } from "./changePriority";
import { addComment } from "./addComment";
import { sendNotification } from "./sendNotification";
import { setDueDate } from "./setDueDate";
import { addFollower } from "./addFollower";
import { updateAiField } from "./updateAiField";

export const ACTION_HANDLERS: Record<ActionType, ActionHandler> = {
  change_assignee: changeAssignee,
  change_status: changeStatus,
  change_priority: changePriority,
  add_comment: addComment,
  send_notification: sendNotification,
  set_due_date: setDueDate,
  add_follower: addFollower,
  update_ai_field: updateAiField,
};

export function getActionHandler(type: ActionType): ActionHandler {
  const h = ACTION_HANDLERS[type];
  if (!h) throw new Error(`No handler registered for action "${type}"`);
  return h;
}

/** Convenience used by the engine to shape a result row. */
export function toActionResult(
  position: number,
  type: ActionType,
  ok: boolean,
  message: string,
  changes?: JsonObject,
): ActionResult {
  return { position, type, ok, message, changes };
}
