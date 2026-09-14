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
