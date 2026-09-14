export type TaskStatus = string;

export interface StatusDefinition {
  id: string;
  label: string;
  color: string;
  isSystem?: boolean;
}

export type TaskPriority = "URGENT" | "HIGH" | "NORMAL" | "LOW";
export type PermissionRole = "VIEW_ONLY" | "COMMENT" | "EDIT" | "FULL_EDIT";
export type FavoritePlacement = "SIDEBAR" | "TOP" | "BOTTOM";
export type TaskRelationshipKind = "RELATED" | "BLOCKS" | "BLOCKED_BY";
export type RecurrenceFrequency = "DAILY" | "WEEKLY" | "MONTHLY";
export type CustomFieldType = "TEXT" | "NUMBER" | "DATE" | "CHECKBOX";

export interface TaskRecurrence {
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays: number[];
  skipWeekends: boolean;
}

export type TaskType =
  | "TASK"
  | "MILESTONE"
  | "CAMPAIGN_LAUNCH"
  | "CANDIDATE"
  | "FORM_RESPONSE"
  | "JOB_POSTING"
  | "MEETING_NOTE"
  | "PERSON";

export interface SharePermission {
  id: string;
  email: string;
  role: PermissionRole;
}

export interface ActivityItem {
  id: string;
  text: string;
  createdAt: string;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface ChecklistItem {
  id: string;
  title: string;
  done: boolean;
  assigneeId?: string;
}

export interface AttachmentItem {
  id: string;
  name: string;
  size: number;
  kind?: "FILE" | "LINK";
  url?: string;
  dataUrl?: string;
  mimeType?: string;
}

export interface CommentItem {
  id: string;
  body: string;
  createdAt: string;
  attachments?: AttachmentItem[];
}

export interface TaskAssignee {
  id: string;
  name: string;
  email: string;
}

export interface LinkedDoc {
  id: string;
  title: string;
  url: string;
}

export interface LinkedWorkItem {
  id: string;
  label: string;
  url: string;
  type: "GITHUB" | "GITLAB" | "DRIVE" | "DROPBOX" | "ZOOM" | "GOOGLE_MEET" | "OTHER";
}

export interface TaskWatcher {
  id: string;
  name: string;
  email: string;
}

export interface WatcherCandidate {
  id: string;
  name: string;
  email: string;
}

export interface TaskRelationship {
  id: string;
  taskId: string;
  kind: TaskRelationshipKind;
}

export interface TimeEntry {
  id: string;
  description: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
}

export interface CustomFieldDefinition {
  id: string;
  name: string;
  type: CustomFieldType;
}

export interface TaskMoveDestination {
  id: string;
  spaceId: string;
  projectId: string;
  listId: string;
  listName: string;
  path: string;
  folders: { id: string; name: string }[];
  current: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  taskType: TaskType;
  isPrivate: boolean;
  isFavorite: boolean;
  favoritePlacement: FavoritePlacement | null;
  showStatusBadge: boolean;
  showPriorityBadge: boolean;
  reminderAt: string;
  archived: boolean;
  timerStartedAt: string | null;
  timerDescription: string;
  timeEntries: TimeEntry[];
  shareLinkEnabled: boolean;
  shareWithList: boolean;
  personalList: boolean;
  personalPriority: boolean;
  relationships: TaskRelationship[];
  recurrence: TaskRecurrence | null;
  startDate: string;
  dueDate: string;
  estimate: string;
  tags: string[];
  assignee: string;
  assignees: TaskAssignee[];
  linkedDocs: LinkedDoc[];
  linkedWork: LinkedWorkItem[];
  watchers: TaskWatcher[];
  permissions: SharePermission[];
  subtasks: Subtask[];
  checklist: ChecklistItem[];
  dependencyIds: string[];
  attachments: AttachmentItem[];
  comments: CommentItem[];
  customFieldValues: Record<string, string>;
  activity: ActivityItem[];
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: string;
  name: string;
  isPrivate: boolean;
  permissions: SharePermission[];
  tasks: Task[];
}

export interface TaskList {
  id: string;
  name: string;
  isPrivate: boolean;
  permissions: SharePermission[];
  folders: Folder[];
}

export interface Project {
  id: string;
  name: string;
  archived: boolean;
  permissions: SharePermission[];
  customFields: CustomFieldDefinition[];
  lists: TaskList[];
}

export interface Space {
  id: string;
  name: string;
  color: string;
  permissions: SharePermission[];
  projects: Project[];
}

export interface WorkspaceData {
  workspaceName: string;
  spaces: Space[];
}

export interface Selection {
  spaceId: string | null;
  projectId: string | null;
  listId: string | null;
  folderId: string | null;
}
