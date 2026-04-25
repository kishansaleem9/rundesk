import { pgEnum } from 'drizzle-orm/pg-core'

export const userRoleEnum = pgEnum('user_role', [
  'super_admin',
  'workspace_admin',
  'manager',
  'member',
  'guest',
])

export const flagScopeEnum = pgEnum('flag_scope', [
  'global',
  'workspace',
  'role',
  'user',
])

export const oauthProviderEnum = pgEnum('oauth_provider', [
  'google',
  'microsoft',
])

export const taskPriorityEnum = pgEnum('task_priority', [
  'urgent',
  'high',
  'normal',
  'low',
])

export const taskStatusEnum = pgEnum('task_status', [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
  'cancelled',
])

export const activityActionEnum = pgEnum('activity_action', [
  'created',
  'updated',
  'deleted',
  'archived',
  'restored',
  'status_changed',
  'priority_changed',
  'assigned',
  'unassigned',
  'commented',
  'label_added',
  'label_removed',
  'due_date_changed',
  'dependency_added',
  'dependency_removed',
  'checklist_item_toggled',
  'attachment_added',
  'attachment_removed',
  'subtask_added',
  'moved',
])

export const dependencyTypeEnum = pgEnum('dependency_type', [
  'blocks',
  'blocked_by',
  'related_to',
])

export const notificationTypeEnum = pgEnum('notification_type', [
  'task_assigned',
  'task_mentioned',
  'task_commented',
  'task_due_soon',
  'task_overdue',
  'task_status_changed',
  'doc_mentioned',
  'doc_commented',
])

export const viewTypeEnum = pgEnum('view_type', [
  'list',
  'board',
  'calendar',
  'gantt',
  'table',
])
