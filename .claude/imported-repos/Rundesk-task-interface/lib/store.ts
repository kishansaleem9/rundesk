import type {
  PermissionRole,
  Task,
  TaskPriority,
  TaskStatus,
  TaskType,
  WorkspaceData,
  StatusDefinition,
} from "./types";

export const STORAGE_KEY = "rundesk-task-workspace-v3";
export const TASK_TEMPLATE_STORAGE_KEY = "rundesk-task-templates-v1";
export const STATUS_STORAGE_KEY = "rundesk-task-statuses-v1";

export const EMPTY_WORKSPACE: WorkspaceData = {
  workspaceName: "RUNDESK",
  spaces: [],
};

export const DEFAULT_STATUSES: StatusDefinition[] = [
  { id: "TODO", label: "To do", color: "#667085", isSystem: true },
  { id: "IN_PROGRESS", label: "In progress", color: "#3b82f6", isSystem: true },
  { id: "IN_REVIEW", label: "In review", color: "#a855f7", isSystem: true },
  { id: "COMPLETE", label: "Complete", color: "#22c55e", isSystem: true },
];

// Kept for compatibility with older components. New code should use the
// live StatusDefinition[] passed from TaskWorkspace.
export const STATUS_META: Record<string, { label: string; dot: string }> = Object.fromEntries(
  DEFAULT_STATUSES.map((status) => [status.id, { label: status.label, dot: status.color }])
);

export const STATUS_COLOR_PRESETS = [
  "#667085",
  "#3b82f6",
  "#7c3aed",
  "#a855f7",
  "#22c55e",
  "#14b8a6",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
];

export function loadStatuses(): StatusDefinition[] {
  if (typeof window === "undefined") return DEFAULT_STATUSES;
  try {
    const raw = window.localStorage.getItem(STATUS_STORAGE_KEY);
    if (!raw) return DEFAULT_STATUSES;
    const parsed = JSON.parse(raw) as StatusDefinition[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_STATUSES;
    const clean = parsed.filter((status) => status && status.id && status.label && status.color);
    return clean.length ? clean : DEFAULT_STATUSES;
  } catch {
    return DEFAULT_STATUSES;
  }
}

export function saveStatuses(statuses: StatusDefinition[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(statuses));
}

export function makeStatusId(label: string) {
  const slug = label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || `STATUS_${Date.now()}`;
}

export const PRIORITY_META: Record<TaskPriority, { label: string }> = {
  URGENT: { label: "Urgent" },
  HIGH: { label: "High" },
  NORMAL: { label: "Normal" },
  LOW: { label: "Low" },
};

export const TASK_TYPE_META: Record<TaskType, { label: string }> = {
  TASK: { label: "Task" },
  MILESTONE: { label: "Milestone" },
  CAMPAIGN_LAUNCH: { label: "Campaign Launch" },
  CANDIDATE: { label: "Candidate" },
  FORM_RESPONSE: { label: "Form Response" },
  JOB_POSTING: { label: "Job Posting" },
  MEETING_NOTE: { label: "Meeting Note" },
  PERSON: { label: "Person" },
};

export const PERMISSION_META: Record<PermissionRole, { label: string; description: string }> = {
  VIEW_ONLY: { label: "View only", description: "can open and read it" },
  COMMENT: { label: "Comment", description: "can read and leave comments" },
  EDIT: { label: "Edit", description: "can change it, but cannot delete it" },
  FULL_EDIT: { label: "Full edit", description: "can change it, share it and delete it" },
};

export const SPACE_COLORS = [
  "#6d5dfc",
  "#e84aa9",
  "#2f80ed",
  "#20b486",
  "#f59e0b",
  "#ef4444",
];

export function uid(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createTask(title: string, status: TaskStatus = "TODO"): Task {
  const now = new Date().toISOString();
  return {
    id: uid("task"),
    title,
    description: "",
    status,
    priority: "NORMAL",
    taskType: "TASK",
    isPrivate: false,
    isFavorite: false,
    favoritePlacement: null,
    showStatusBadge: true,
    showPriorityBadge: true,
    reminderAt: "",
    archived: false,
    timerStartedAt: null,
    timerDescription: "",
    timeEntries: [],
    shareLinkEnabled: false,
    shareWithList: true,
    personalList: false,
    personalPriority: false,
    relationships: [],
    recurrence: null,
    startDate: "",
    dueDate: "",
    estimate: "",
    tags: [],
    assignee: "",
    assignees: [],
    linkedDocs: [],
    linkedWork: [],
    watchers: [],
    permissions: [],
    subtasks: [],
    checklist: [],
    dependencyIds: [],
    attachments: [],
    comments: [],
    customFieldValues: {},
    activity: [{ id: uid("activity"), text: "Task created", createdAt: now }],
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeTask(task: Partial<Task>): Task {
  const now = new Date().toISOString();
  return {
    id: task.id ?? uid("task"),
    title: task.title ?? "Untitled task",
    description: task.description ?? "",
    status: task.status ?? "TODO",
    priority: task.priority ?? "NORMAL",
    taskType: task.taskType ?? "TASK",
    isPrivate: task.isPrivate ?? false,
    isFavorite: task.isFavorite ?? false,
    favoritePlacement: task.favoritePlacement ?? null,
    showStatusBadge: task.showStatusBadge ?? true,
    showPriorityBadge: task.showPriorityBadge ?? true,
    reminderAt: task.reminderAt ?? "",
    archived: task.archived ?? false,
    timerStartedAt: task.timerStartedAt ?? null,
    timerDescription: task.timerDescription ?? "",
    timeEntries: Array.isArray(task.timeEntries) ? task.timeEntries : [],
    shareLinkEnabled: task.shareLinkEnabled ?? false,
    shareWithList: task.shareWithList ?? true,
    personalList: task.personalList ?? false,
    personalPriority: task.personalPriority ?? false,
    relationships: Array.isArray(task.relationships) ? task.relationships : [],
    recurrence: task.recurrence ?? null,
    startDate: task.startDate ?? "",
    dueDate: task.dueDate ?? "",
    estimate: task.estimate ?? "",
    tags: Array.isArray(task.tags) ? task.tags : [],
    assignee: task.assignee ?? "",
    assignees: Array.isArray(task.assignees)
      ? task.assignees
      : task.assignee
        ? [{ id: `legacy:${task.assignee.toLowerCase()}`, name: task.assignee, email: task.assignee.includes("@") ? task.assignee : "" }]
        : [],
    linkedDocs: Array.isArray(task.linkedDocs) ? task.linkedDocs : [],
    linkedWork: Array.isArray(task.linkedWork) ? task.linkedWork : [],
    watchers: Array.isArray(task.watchers) ? task.watchers : [],
    permissions: Array.isArray(task.permissions) ? task.permissions : [],
    subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
    checklist: Array.isArray(task.checklist) ? task.checklist : [],
    dependencyIds: Array.isArray(task.dependencyIds) ? task.dependencyIds : [],
    attachments: Array.isArray(task.attachments) ? task.attachments : [],
    comments: Array.isArray(task.comments) ? task.comments.map((comment) => ({ ...comment, attachments: Array.isArray(comment.attachments) ? comment.attachments : [] })) : [],
    customFieldValues: task.customFieldValues && typeof task.customFieldValues === "object" ? task.customFieldValues : {},
    activity: Array.isArray(task.activity) ? task.activity : [],
    createdAt: task.createdAt ?? now,
    updatedAt: task.updatedAt ?? now,
  };
}

function normalizeWorkspace(data: WorkspaceData): WorkspaceData {
  return {
    ...data,
    spaces: (data.spaces ?? []).map((space) => ({
      ...space,
      permissions: Array.isArray(space.permissions) ? space.permissions : [],
      projects: (space.projects ?? []).map((project) => ({
        ...project,
        archived: project.archived ?? false,
        permissions: Array.isArray(project.permissions) ? project.permissions : [],
        customFields: Array.isArray(project.customFields) ? project.customFields : [],
        lists: (project.lists ?? []).map((list) => ({
          ...list,
          isPrivate: list.isPrivate ?? false,
          permissions: Array.isArray(list.permissions) ? list.permissions : [],
          folders: (list.folders ?? []).map((folder) => ({
            ...folder,
            isPrivate: folder.isPrivate ?? false,
            permissions: Array.isArray(folder.permissions) ? folder.permissions : [],
            tasks: (folder.tasks ?? []).map((task) => normalizeTask(task)),
          })),
        })),
      })),
    })),
  };
}

export function loadWorkspace(): WorkspaceData {
  if (typeof window === "undefined") return EMPTY_WORKSPACE;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return EMPTY_WORKSPACE;
    const parsed = JSON.parse(saved) as WorkspaceData;
    return parsed && Array.isArray(parsed.spaces) ? normalizeWorkspace(parsed) : EMPTY_WORKSPACE;
  } catch {
    return EMPTY_WORKSPACE;
  }
}

export function saveWorkspace(data: WorkspaceData) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
