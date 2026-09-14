export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER";

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMemberRecord {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  joinedAt: string;
  user: User;
}

export interface WorkspaceMembersResponse {
  currentRole: WorkspaceRole;
  members: WorkspaceMemberRecord[];
}

export interface Channel {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  topic?: string | null;
  isPrivate: boolean;
  type: "CHANNEL" | "DIRECT";
  createdById: string;
  createdAt: string;
  updatedAt: string;
  unreadCount?: number;
  lastReadAt?: string | null;
  notificationsMuted?: boolean;
  _count?: { members: number; messages: number };
}

export interface ApiReaction {
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
  user: User;
}

export interface MessageAttachment {
  id?: string;
  messageId?: string;
  originalName: string;
  storageKey: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  parentMessageId: string | null;
  createdAt: string;
  updatedAt: string;
  editedAt: string | null;
  author: User;
  reactions: ApiReaction[];
  attachments: MessageAttachment[];
  mentions?: Array<{ userId: string; user: User }>;
  taskLinks?: Array<{ taskId: string; task: Task }>;
  assignments?: Array<{
    id: string;
    assigneeId: string;
    resolvedAt: string | null;
    assignee: User;
  }>;
  _count: { replies: number };
  optimistic?: boolean;
}

export interface TaskAssignee {
  taskId?: string;
  userId: string;
  assignedAt?: string;
  user: User;
}

export interface Task {
  id: string;
  workspaceId: string;
  channelId: string | null;
  sourceMessageId: string | null;
  title: string;
  description: string | null;
  status: "TODO" | "IN_PROGRESS" | "COMPLETE";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  createdById: string;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  assignees: TaskAssignee[];
  channel?: Channel | null;
}

export interface Conversation {
  id: string;
  workspaceId: string;
  channelId: string;
  channel: Channel;
  members: Array<{ userId: string; user: User }>;
}

export interface BootstrapData {
  currentUser: User;
  currentRole: WorkspaceRole;
  canManageWorkspace: boolean;
  workspace: Workspace;
  users: User[];
  channels: Channel[];
  tasks: Task[];
  conversations: Conversation[];
}

export interface SearchResults {
  messages: Array<Message & { channel: Channel }>;
  channels: Channel[];
  tasks: Task[];
  users: User[];
}

export type ComposerPopup =
  | "plus"
  | "ai"
  | "attachment"
  | "task-picker"
  | "mention"
  | "emoji"
  | "clip"
  | "create-task"
  | "whiteboard"
  | "send"
  | "commands"
  | null;

// ---------------------------------------------------------------------------
// Time tracking (see app/api/timesheets, app/api/time-entries, app/api/timer)
// ---------------------------------------------------------------------------

export type TimeEntryType = "TIMER" | "MANUAL";

export interface TimeEntryTask {
  id: string;
  title: string;
  status: Task["status"];
  channel: { id: string; name: string } | null;
}

export interface TimeEntry {
  id: string;
  workspaceId: string;
  taskId: string;
  userId: string;
  entryType: TimeEntryType;
  /** ISO instant. Duration-only manual entries start at local midnight. */
  startedAt: string;
  /** ISO instant; null while a timer runs or for duration-only entries. */
  endedAt: string | null;
  durationSeconds: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  task: TimeEntryTask;
  /** Timesheet responses only: the entry sits in a submitted or approved week. */
  locked?: boolean;
}

export interface TimesheetTask {
  id: string;
  title: string;
  status: Task["status"];
  priority: Task["priority"];
  dueDate: string | null;
  /** ISO instant; "Sort by date added" uses it. */
  createdAt: string;
  channel: { id: string; name: string } | null;
  /** false for tasks that have time this week but are no longer assigned */
  assigned: boolean;
}

export type TimesheetStatus = "SUBMITTED" | "APPROVED" | "REJECTED";

/** One week sent for approval. No row means "not submitted". */
export interface TimesheetSubmission {
  id: string;
  workspaceId: string;
  userId: string;
  /** Monday, YYYY-MM-DD */
  weekStart: string;
  /** IANA zone the week was submitted from; the lock is judged in it. */
  timeZone: string;
  status: TimesheetStatus;
  /** Server-computed total at (re)submission time. */
  totalSeconds: number;
  note: string | null;
  submittedAt: string;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  /** Admin responsible for reviewing; any admin may still approve or reject. */
  assignedToId: string | null;
  assignedById: string | null;
  assignedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; avatar: string | null };
  reviewedBy: { id: string; name: string } | null;
  assignedTo: { id: string; name: string; avatar: string | null } | null;
  assignedBy: { id: string; name: string } | null;
}

/** `code` on 409 responses from the time-tracking routes. */
export type TimeApiErrorCode = "TIMER_RUNNING" | "TIMESHEET_LOCKED" | "TIMESHEET_CONFLICT";

export interface TimesheetTotals {
  byTaskDay: Record<string, Record<string, number>>;
  byTask: Record<string, number>;
  byDay: Record<string, number>;
  week: number;
}

export interface TimesheetResponse {
  viewer: { id: string; canManageWorkspace: boolean };
  user: { id: string; name: string; avatar: string | null };
  workspace: { id: string; name: string };
  /** Monday, YYYY-MM-DD */
  weekStart: string;
  days: string[];
  timeZone: string;
  tasks: TimesheetTask[];
  /** Completed entries in the week; the running timer is `activeTimer`. */
  entries: TimeEntry[];
  totals: TimesheetTotals;
  activeTimer: TimeEntry | null;
  /** This week's approval request, if any. */
  submission: TimesheetSubmission | null;
  /** True while the week is pending approval or approved: no changes allowed. */
  locked: boolean;
  /** The week was submitted from a different zone than it is viewed in. */
  timeZoneMismatch: boolean;
  serverTime: string;
}

export type TimesheetStatusCounts = Record<TimesheetStatus, number>;

/** An OWNER/ADMIN member a submission may be assigned to. */
export interface ApprovalsAdmin {
  id: string;
  name: string;
  avatar: string | null;
  role: WorkspaceRole;
}

/** GET /api/timesheets/approvals */
export interface TimesheetApprovalsResponse {
  /** Matches every filter, newest first. */
  submissions: TimesheetSubmission[];
  /** Per status; honours every filter except `status`. */
  counts: TimesheetStatusCounts;
  admins: ApprovalsAdmin[];
}

export interface TimesheetOverviewChannel {
  id: string;
  name: string;
  isPrivate: boolean;
}

export interface TimesheetOverviewMember {
  user: { id: string; name: string; avatar: string | null };
  role: WorkspaceRole;
  /** Weekly reference capacity in seconds (40h today). */
  capacitySeconds: number;
  /** dayKey → seconds in the viewer's zone; every day of the week is present. */
  byDay: Record<string, number>;
  weekSeconds: number;
  /** This member's submission for the week, if any. */
  submission: TimesheetSubmission | null;
  /** A timer is running right now (not necessarily inside this week). */
  running: boolean;
  runningSince: string | null;
}

/** GET /api/timesheets/overview (admins) */
export interface TimesheetOverviewResponse {
  viewer: { id: string; role: WorkspaceRole };
  workspace: { id: string; name: string };
  /** Monday, YYYY-MM-DD */
  weekStart: string;
  days: string[];
  /** The viewer's zone; every member is bucketed in it. */
  timeZone: string;
  /** Non-DM channels the viewer may see: public ones plus private ones they belong to. */
  channels: TimesheetOverviewChannel[];
  channelId: string | null;
  members: TimesheetOverviewMember[];
  /** Workspace-wide pending submissions, for the Approvals badge. */
  pendingCount: number;
  serverTime: string;
}

// ---------------------------------------------------------------------------
// Task detail (GET /api/tasks/:taskId)
// ---------------------------------------------------------------------------

export interface TaskPermissions {
  /** Creator, assignee or workspace admin. Also the rule for tracking time. */
  canEdit: boolean;
  /** Creator or workspace admin. */
  canDelete: boolean;
}

export interface TaskTimeSummary {
  /** Completed entries of every user on the task; running timers excluded. */
  totalSeconds: number;
  /** The caller's completed entries only. */
  myTotalSeconds: number;
  entriesCount: number;
  /** The caller's running timer when it is on this task, else null. */
  running: TimeEntry | null;
}

export interface TaskDetailResponse extends Task {
  permissions: TaskPermissions;
  time: TaskTimeSummary;
}
