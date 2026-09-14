/**
 * Core domain types for the Rundesk Automation Engine.
 *
 * Architecture: every Workflow has exactly ONE Trigger, up to 15 Conditions,
 * and up to 6 Actions.  An incoming event is matched against triggers, the
 * conditions are evaluated against the affected task, and if they pass the
 * actions are executed in order.
 *
 * Everything in this file is plain data (no runtime dependencies) so it can be
 * shared safely between server code, the Prisma layer and client components.
 */

/* ------------------------------------------------------------------ */
/* Limits                                                              */
/* ------------------------------------------------------------------ */

/** Hard cap on conditions per workflow (enforced by engine, API and UI). */
export const MAX_CONDITIONS = 15;
/** Hard cap on actions per workflow (enforced by engine, API and UI). */
export const MAX_ACTIONS = 6;
/** Max nesting depth for events emitted by actions (prevents infinite loops). */
export const MAX_EVENT_DEPTH = 3;

/* ------------------------------------------------------------------ */
/* Enumerations                                                        */
/* ------------------------------------------------------------------ */

export const TRIGGER_TYPES = [
  "task_created",
  "status_changed",
  "priority_changed",
  "assignee_changed",
  "due_date_arrives",
  "comment_added",
  "task_updated", // any field changed; payload { changed: string[] }
] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const CONDITION_FIELDS = [
  "status",
  "priority",
  "assigneeId",
  "listId",
  "tags",
  "dueDate",
  "title",
] as const;
export type ConditionField = (typeof CONDITION_FIELDS)[number];

export const CONDITION_OPERATORS = [
  "eq",
  "neq",
  "in",
  "not_in",
  "contains",
  "gt",
  "lt",
  "is_empty",
  "is_not_empty",
] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const ACTION_TYPES = [
  "change_assignee",
  "change_status",
  "change_priority",
  "add_comment",
  "send_notification",
  "set_due_date",
  "add_follower", // { followerId }
  "update_ai_field", // { field: AiFieldKey } — (mock) AI-generated custom field
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/** Custom fields that can be auto-filled by the (mock) AI provider. */
export const AI_FIELD_KEYS = [
  "summary",
  "progressUpdates",
  "projectMilestone",
  "assignedTeamMember",
  "completionDeadline",
] as const;
export type AiFieldKey = (typeof AI_FIELD_KEYS)[number];

/** How multiple conditions combine: ALL = logical AND, ANY = logical OR. */
export type ConditionLogic = "ALL" | "ANY";

export type RunStatus = "SUCCESS" | "SKIPPED" | "FAILED";

/* ------------------------------------------------------------------ */
/* JSON helpers (mirrors what MySQL JSON columns can hold)             */
/* ------------------------------------------------------------------ */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/* ------------------------------------------------------------------ */
/* Workflow definition                                                 */
/* ------------------------------------------------------------------ */

export interface TriggerDef {
  type: TriggerType;
  /** Optional scoping, e.g. `{ to: "done" }` for status_changed. Stored as JSON. */
  config: JsonObject;
}

export interface ConditionDef {
  /** 0-based order, used for deterministic evaluation and logging. */
  position: number;
  field: ConditionField;
  operator: ConditionOperator;
  /** Expected value. Stored as JSON so it can be a string, number or array. */
  value: JsonValue;
}

export interface ActionDef {
  position: number;
  type: ActionType;
  /** Type-specific payload, e.g. `{ assigneeId: "u_qa" }`. Stored as JSON. */
  payload: JsonObject;
}

/** What the UI/API sends when creating a workflow. */
export interface WorkflowInput {
  workspaceId: string;
  name: string;
  description?: string;
  isActive: boolean;
  /** Set when the workflow was created from a preset (see presets.ts). */
  templateKey?: string | null;
  /** Restrict to tasks in one list/project; null or undefined = whole workspace. */
  listId?: string | null;
  conditionLogic: ConditionLogic;
  trigger: TriggerDef;
  conditions: ConditionDef[];
  actions: ActionDef[];
}

/** A persisted workflow with database identifiers. */
export interface Workflow extends WorkflowInput {
  id: string;
  trigger: TriggerDef & { id: string };
  conditions: Array<ConditionDef & { id: string }>;
  actions: Array<ActionDef & { id: string }>;
  createdAt: string;
  updatedAt: string;
}

export type WorkflowPatch = Partial<
  Pick<Workflow, "name" | "description" | "isActive" | "conditionLogic">
>;

/* ------------------------------------------------------------------ */
/* Runtime: events, tasks, results                                     */
/* ------------------------------------------------------------------ */

/** An event emitted by the host app (or by an action) that may fire workflows. */
export interface AutomationEvent {
  type: TriggerType;
  workspaceId: string;
  taskId: string;
  /** Event details, e.g. `{ from: "todo", to: "done" }`. */
  payload: JsonObject;
  /** Recursion depth; incremented when an action emits a follow-up event. */
  depth?: number;
}

export interface TaskComment {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

/** Minimal task shape the engine needs. Map your real Rundesk task onto this. */
export interface Task {
  id: string;
  workspaceId: string;
  listId: string;
  title: string;
  status: string;
  priority: string;
  assigneeId: string | null;
  tags: string[];
  /** ISO date string or null. */
  dueDate: string | null;
  comments: TaskComment[];
  /** Users watching the task (ClickUp "followers"). */
  followers: string[];
  /** Values written by the update_ai_field action, keyed by AiFieldKey. */
  aiFields: Partial<Record<AiFieldKey, string>>;
  updatedAt: string;
}

/** Fields a user can change on a task from the list view. */
export type TaskPatch = Partial<
  Pick<Task, "title" | "status" | "priority" | "assigneeId" | "tags" | "dueDate" | "listId">
>;

/** Input for creating a task from the list view. */
export interface NewTaskInput {
  workspaceId: string;
  listId: string;
  title: string;
  status?: string;
  priority?: string;
  assigneeId?: string | null;
  tags?: string[];
  dueDate?: string | null;
}

export interface Notification {
  id: string;
  workspaceId: string;
  recipientId: string;
  taskId: string;
  message: string;
  createdAt: string;
}

export interface ConditionResult {
  position: number;
  field: ConditionField;
  operator: ConditionOperator;
  expected: JsonValue;
  actual: JsonValue;
  passed: boolean;
}

export interface ActionResult {
  position: number;
  type: ActionType;
  ok: boolean;
  message: string;
  /** Field-level changes applied to the task, for the run log. */
  changes?: JsonObject;
}

/** Outcome of evaluating ONE workflow against ONE event. */
export interface RunReport {
  workflowId: string;
  workflowName: string;
  eventType: TriggerType;
  taskId: string;
  depth: number;
  status: RunStatus;
  conditionsPassed: boolean;
  conditionResults: ConditionResult[];
  actionResults: ActionResult[];
  error?: string;
}

/** A persisted RunReport (maps to the `automation_runs` table). */
export interface AutomationRun extends RunReport {
  id: string;
  workspaceId: string;
  eventPayload: JsonObject;
  createdAt: string;
}
