/**
 * Automation PRESETS — the one-click cards in the ClickUp-style panel.
 *
 * A preset is a template: `build()` expands it into one or more ordinary
 * `WorkflowInput`s tagged with `templateKey` and scoped to a `listId`.
 * Toggling a preset on creates (or re-activates) those workflows; toggling it
 * off pauses them. Presets therefore share the engine, run log and Manage
 * screen with hand-built rules — there is no second execution path.
 *
 * Adding a preset = adding one entry to `PRESETS`.
 */

import { AI_FIELD_LABELS, type OptionsKey } from "./catalog";
import type { ActionDef, AiFieldKey, ConditionDef, TriggerDef, WorkflowInput } from "./types";

export type PresetSection = "ai_fields" | "automations";

export interface PresetParam {
  key: string;
  label: string;
  optionsKey: OptionsKey;
}

export interface PresetScope {
  workspaceId: string;
  listId: string;
}

export interface AutomationPreset {
  key: string;
  section: PresetSection;
  label: string;
  description: string;
  /** Emoji/icon shown on the card. */
  icon: string;
  /** Rendered with a "Suggested" tag like ClickUp's second row. */
  suggested?: boolean;
  /** Inputs the user must choose when turning the preset on. */
  params?: PresetParam[];
  build(scope: PresetScope, params: Record<string, string>): WorkflowInput[];
}

/** Serializable subset sent to the UI (no functions). */
export type PresetMeta = Omit<AutomationPreset, "build">;

/* ---------- helpers ---------- */

const wf = (
  scope: PresetScope,
  key: string,
  name: string,
  trigger: TriggerDef,
  actions: ActionDef[],
  conditions: ConditionDef[] = [],
  description?: string,
): WorkflowInput => ({
  workspaceId: scope.workspaceId,
  listId: scope.listId,
  templateKey: key,
  name,
  description,
  isActive: true,
  conditionLogic: "ALL",
  trigger,
  conditions,
  actions,
});

const aiAction = (field: AiFieldKey): ActionDef => ({ position: 0, type: "update_ai_field", payload: { field } });

/** AI-field presets regenerate a field on several triggers → one workflow per trigger. */
const aiFieldPreset = (
  key: string,
  field: AiFieldKey,
  description: string,
  icon: string,
  triggers: TriggerDef["type"][],
  suggested = false,
): AutomationPreset => ({
  key,
  section: "ai_fields",
  label: AI_FIELD_LABELS[field],
  description,
  icon,
  suggested,
  build: (scope) =>
    triggers.map((t) =>
      wf(scope, key, `AI · ${AI_FIELD_LABELS[field]} (on ${t.replace(/_/g, " ")})`, { type: t, config: {} }, [aiAction(field)], [], description),
    ),
});

const requireParam = (params: Record<string, string>, key: string) => {
  const v = params[key];
  if (!v) throw new Error(`Preset parameter "${key}" is required`);
  return v;
};

/* ---------- catalogue ---------- */

export const PRESETS: AutomationPreset[] = [
  /* ---- AI Fields ---- */
  aiFieldPreset(
    "ai_summary",
    "summary",
    "Keep a one-line summary of each task up to date.",
    "✨",
    ["task_created", "task_updated", "comment_added"],
  ),
  aiFieldPreset(
    "ai_progress_updates",
    "progressUpdates",
    "Write a short progress note whenever status or comments change.",
    "📈",
    ["status_changed", "comment_added"],
  ),
  aiFieldPreset(
    "ai_project_milestone",
    "projectMilestone",
    "Describe which milestone the task has reached.",
    "🏁",
    ["status_changed", "task_created"],
    true,
  ),
  aiFieldPreset(
    "ai_assigned_team_member",
    "assignedTeamMember",
    "Explain who owns the task and why it matters.",
    "👤",
    ["assignee_changed", "task_created"],
    true,
  ),
  aiFieldPreset(
    "ai_completion_deadline",
    "completionDeadline",
    "Track how close the task is to its deadline.",
    "⏳",
    ["task_updated", "task_created"],
    true,
  ),

  /* ---- Other Automations ---- */
  {
    key: "auto_assign",
    section: "automations",
    label: "Auto assign",
    description: "Assign every new task in this project to someone.",
    icon: "👤",
    params: [{ key: "assigneeId", label: "Assign new tasks to", optionsKey: "users" }],
    build: (scope, params) => [
      wf(scope, "auto_assign", "Auto assign", { type: "task_created", config: {} }, [
        { position: 0, type: "change_assignee", payload: { assigneeId: requireParam(params, "assigneeId") } },
      ]),
    ],
  },
  {
    key: "auto_follow",
    section: "automations",
    label: "Auto follow",
    description: "Make someone follow every new task in this project.",
    icon: "👁️",
    params: [{ key: "followerId", label: "Follower", optionsKey: "users" }],
    build: (scope, params) => [
      wf(scope, "auto_follow", "Auto follow", { type: "task_created", config: {} }, [
        { position: 0, type: "add_follower", payload: { followerId: requireParam(params, "followerId") } },
      ]),
    ],
  },
  {
    key: "assign_new_project_tasks",
    section: "automations",
    label: "Assign New Project Tasks",
    description: "Give unassigned new tasks an owner.",
    icon: "🤖",
    suggested: true,
    params: [{ key: "assigneeId", label: "Default owner", optionsKey: "users" }],
    build: (scope, params) => [
      wf(
        scope,
        "assign_new_project_tasks",
        "Assign New Project Tasks",
        { type: "task_created", config: {} },
        [{ position: 0, type: "change_assignee", payload: { assigneeId: requireParam(params, "assigneeId") } }],
        [{ position: 0, field: "assigneeId", operator: "is_empty", value: null }],
      ),
    ],
  },
  {
    key: "mark_overdue_tasks_complete",
    section: "automations",
    label: "Mark Overdue Tasks Complete",
    description: "When a task's due date arrives and it isn't done, close it with a note.",
    icon: "🤖",
    suggested: true,
    build: (scope) => [
      wf(
        scope,
        "mark_overdue_tasks_complete",
        "Mark Overdue Tasks Complete",
        { type: "due_date_arrives", config: {} },
        [
          { position: 0, type: "change_status", payload: { status: "done" } },
          { position: 1, type: "add_comment", payload: { body: "⏰ Auto-closed: due date reached for \"{{task.title}}\"." } },
        ],
        [{ position: 0, field: "status", operator: "neq", value: "done" }],
      ),
    ],
  },
  {
    key: "notify_when_project_complete",
    section: "automations",
    label: "Notify When Project Complete",
    description: "Notify someone whenever a task in this project is completed.",
    icon: "🤖",
    suggested: true,
    params: [{ key: "recipientId", label: "Notify", optionsKey: "users" }],
    build: (scope, params) => [
      wf(
        scope,
        "notify_when_project_complete",
        "Notify When Project Complete",
        { type: "status_changed", config: { to: "done" } },
        [
          {
            position: 0,
            type: "send_notification",
            payload: { recipientId: requireParam(params, "recipientId"), message: "✅ \"{{task.title}}\" is complete." },
          },
        ],
      ),
    ],
  },
];

export const getPreset = (key: string) => PRESETS.find((p) => p.key === key);

export const presetMeta = (p: AutomationPreset): PresetMeta => {
  // Strip the build function so the object is JSON-serializable for the UI.
  const { build: _build, ...meta } = p;
  void _build;
  return meta;
};
