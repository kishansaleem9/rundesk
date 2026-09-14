/**
 * The automation CATALOG is the single source of truth describing which
 * triggers, condition fields, operators and actions exist, what they are
 * called in the UI, and which inputs they need.
 *
 * Both the React builder (to render dropdowns) and the backend (to validate
 * payloads) read from this file, so the two can never drift apart.
 *
 * The option lists (statuses, users, ...) are MOCK data for the prototype.
 * When integrating into Rundesk, replace `OPTIONS` with values loaded from
 * the workspace (or pass a workspace-specific catalog into the builder).
 */

import {
  AI_FIELD_KEYS,
  type ActionType,
  type AiFieldKey,
  type ConditionField,
  type ConditionOperator,
  type TriggerType,
} from "./types";

/* ------------------------------------------------------------------ */
/* Shared input descriptors                                            */
/* ------------------------------------------------------------------ */

export type InputKind = "text" | "textarea" | "number" | "date" | "select";

export interface OptionDef {
  value: string;
  label: string;
}

/** Keys into `OPTIONS` for dropdowns that share workspace-level lists. */
export type OptionsKey = "statuses" | "priorities" | "users" | "lists";

/** Describes one input the UI must render for a trigger config / action payload. */
export interface FieldDef {
  key: string;
  label: string;
  input: InputKind;
  /** Use a shared option list (statuses, users, ...). */
  optionsKey?: OptionsKey;
  /** Or provide inline options. */
  options?: OptionDef[];
  optional?: boolean;
  placeholder?: string;
  help?: string;
}

/* ------------------------------------------------------------------ */
/* Mock workspace data                                                 */
/* ------------------------------------------------------------------ */

export const OPTIONS: Record<OptionsKey, OptionDef[]> = {
  statuses: [
    { value: "todo", label: "To Do" },
    { value: "in_progress", label: "In Progress" },
    { value: "review", label: "In Review" },
    { value: "done", label: "Done" },
  ],
  priorities: [
    { value: "low", label: "Low" },
    { value: "normal", label: "Normal" },
    { value: "high", label: "High" },
    { value: "urgent", label: "Urgent" },
  ],
  users: [
    { value: "u_ali", label: "Ali" },
    { value: "u_hamda", label: "Hamda" },
    { value: "u_sara", label: "Sara" },
    { value: "u_qa", label: "QA Team" },
  ],
  // Lists are shown as "Projects" in the ClickUp-style view.
  lists: [
    { value: "list_eng", label: "Project 1" },
    { value: "list_design", label: "Project 2" },
    { value: "list_marketing", label: "Project 3" },
  ],
};

/** Display names for AI custom fields. */
export const AI_FIELD_LABELS: Record<AiFieldKey, string> = {
  summary: "Summary",
  progressUpdates: "Progress Updates",
  projectMilestone: "Project Milestone",
  assignedTeamMember: "Assigned Team Member",
  completionDeadline: "Completion Deadline",
};
export const AI_FIELD_OPTIONS: OptionDef[] = AI_FIELD_KEYS.map((k) => ({ value: k, label: AI_FIELD_LABELS[k] }));

/* ------------------------------------------------------------------ */
/* Triggers                                                            */
/* ------------------------------------------------------------------ */

export interface TriggerDefinition {
  type: TriggerType;
  label: string;
  description: string;
  /**
   * Fields the user can set to narrow the trigger (stored in `Trigger.config`).
   * The same keys are expected in the incoming event's `payload`, so the
   * engine can match `config.to === payload.to`.
   */
  configFields: FieldDef[];
}

export const TRIGGERS: TriggerDefinition[] = [
  {
    type: "task_created",
    label: "Task is created",
    description: "Fires when a new task is added.",
    configFields: [
      { key: "listId", label: "In list", input: "select", optionsKey: "lists", optional: true },
    ],
  },
  {
    type: "status_changed",
    label: "Status changes",
    description: "Fires when a task moves to a different status.",
    configFields: [
      { key: "from", label: "From status", input: "select", optionsKey: "statuses", optional: true },
      { key: "to", label: "To status", input: "select", optionsKey: "statuses", optional: true },
    ],
  },
  {
    type: "priority_changed",
    label: "Priority changes",
    description: "Fires when a task's priority is updated.",
    configFields: [
      { key: "to", label: "To priority", input: "select", optionsKey: "priorities", optional: true },
    ],
  },
  {
    type: "assignee_changed",
    label: "Assignee changes",
    description: "Fires when a task is reassigned.",
    configFields: [
      { key: "to", label: "New assignee", input: "select", optionsKey: "users", optional: true },
    ],
  },
  {
    type: "due_date_arrives",
    label: "Due date arrives",
    description: "Fires when a task's due date is reached (scheduler-driven).",
    configFields: [],
  },
  {
    type: "comment_added",
    label: "Comment is added",
    description: "Fires when someone comments on a task.",
    configFields: [],
  },
  {
    type: "task_updated",
    label: "Task is updated",
    description: "Fires when any task field changes (status, priority, assignee, due date, title, tags).",
    configFields: [],
  },
];

/* ------------------------------------------------------------------ */
/* Conditions                                                          */
/* ------------------------------------------------------------------ */

export interface ConditionFieldDefinition {
  field: ConditionField;
  label: string;
  /** Operators that make sense for this field (UI only offers these). */
  operators: ConditionOperator[];
  input: InputKind;
  optionsKey?: OptionsKey;
}

export const CONDITION_FIELDS_CATALOG: ConditionFieldDefinition[] = [
  { field: "status", label: "Status", operators: ["eq", "neq", "in", "not_in"], input: "select", optionsKey: "statuses" },
  { field: "priority", label: "Priority", operators: ["eq", "neq", "in", "not_in"], input: "select", optionsKey: "priorities" },
  { field: "assigneeId", label: "Assignee", operators: ["eq", "neq", "in", "is_empty", "is_not_empty"], input: "select", optionsKey: "users" },
  { field: "listId", label: "List", operators: ["eq", "neq", "in"], input: "select", optionsKey: "lists" },
  { field: "tags", label: "Tags", operators: ["contains", "in", "is_empty", "is_not_empty"], input: "text" },
  { field: "dueDate", label: "Due date", operators: ["lt", "gt", "is_empty", "is_not_empty"], input: "date" },
  { field: "title", label: "Title", operators: ["contains", "eq", "neq"], input: "text" },
];

export const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  eq: "is",
  neq: "is not",
  in: "is any of",
  not_in: "is none of",
  contains: "contains",
  gt: "is after / greater than",
  lt: "is before / less than",
  is_empty: "is empty",
  is_not_empty: "is not empty",
};

/** Operators that need no value input. */
export const UNARY_OPERATORS: ConditionOperator[] = ["is_empty", "is_not_empty"];
/** Operators whose value is a list (comma separated in the UI). */
export const LIST_OPERATORS: ConditionOperator[] = ["in", "not_in"];

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

export interface ActionDefinition {
  type: ActionType;
  label: string;
  description: string;
  payloadFields: FieldDef[];
}

const TEMPLATE_HELP =
  "Supports {{task.title}}, {{task.status}}, {{task.priority}}, {{event.from}}, {{event.to}}";

export const ACTIONS: ActionDefinition[] = [
  {
    type: "change_assignee",
    label: "Change assignee",
    description: "Reassign the task to someone.",
    payloadFields: [{ key: "assigneeId", label: "Assign to", input: "select", optionsKey: "users" }],
  },
  {
    type: "change_status",
    label: "Change status",
    description: "Move the task to another status.",
    payloadFields: [{ key: "status", label: "New status", input: "select", optionsKey: "statuses" }],
  },
  {
    type: "change_priority",
    label: "Change priority",
    description: "Set a new priority on the task.",
    payloadFields: [{ key: "priority", label: "New priority", input: "select", optionsKey: "priorities" }],
  },
  {
    type: "add_comment",
    label: "Add comment",
    description: "Post an automated comment on the task.",
    payloadFields: [
      { key: "body", label: "Comment", input: "textarea", placeholder: "Task {{task.title}} was updated", help: TEMPLATE_HELP },
    ],
  },
  {
    type: "send_notification",
    label: "Send notification",
    description: "Notify a teammate.",
    payloadFields: [
      { key: "recipientId", label: "Recipient", input: "select", optionsKey: "users" },
      { key: "message", label: "Message", input: "textarea", placeholder: "{{task.title}} needs attention", help: TEMPLATE_HELP },
    ],
  },
  {
    type: "set_due_date",
    label: "Set due date",
    description: "Set the due date relative to now or to an exact day.",
    payloadFields: [
      { key: "days", label: "Days from now", input: "number", optional: true, placeholder: "e.g. 3" },
      { key: "date", label: "Or exact date", input: "date", optional: true },
    ],
  },
  {
    type: "add_follower",
    label: "Add follower",
    description: "Make a teammate follow the task so they get updates.",
    payloadFields: [{ key: "followerId", label: "Follower", input: "select", optionsKey: "users" }],
  },
  {
    type: "update_ai_field",
    label: "Update AI field",
    description: "Regenerate an AI custom field from the task's current data.",
    payloadFields: [{ key: "field", label: "AI field", input: "select", options: AI_FIELD_OPTIONS }],
  },
];

/* ------------------------------------------------------------------ */
/* Bundle for the UI                                                   */
/* ------------------------------------------------------------------ */

export const CATALOG = {
  triggers: TRIGGERS,
  conditionFields: CONDITION_FIELDS_CATALOG,
  operatorLabels: OPERATOR_LABELS,
  actions: ACTIONS,
  options: OPTIONS,
};
export type Catalog = typeof CATALOG;

/* Lookup helpers */
export const getTriggerDef = (type: TriggerType) => TRIGGERS.find((t) => t.type === type);
export const getActionDef = (type: ActionType) => ACTIONS.find((a) => a.type === type);
export const getConditionFieldDef = (field: ConditionField) =>
  CONDITION_FIELDS_CATALOG.find((c) => c.field === field);
export const optionLabel = (key: OptionsKey, value: string | null | undefined) =>
  OPTIONS[key].find((o) => o.value === value)?.label ?? value ?? "—";
