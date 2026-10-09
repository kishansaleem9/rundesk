export const FLAGS = {
  // Auth
  AUTH_2FA: 'auth.2fa',
  AUTH_SSO_GOOGLE: 'auth.sso_google',
  AUTH_SSO_MICROSOFT: 'auth.sso_microsoft',

  // Core tasks
  CORE_TASKS: 'core.tasks',
  TASKS_SUBTASKS: 'tasks.subtasks',
  TASKS_CHECKLISTS: 'tasks.checklists',
  TASKS_CUSTOM_FIELDS: 'tasks.custom_fields',
  TASKS_DEPENDENCIES: 'tasks.dependencies',
  TASKS_WATCHERS: 'tasks.watchers',
  TASKS_TEMPLATES: 'tasks.templates',
  TASKS_RECURRING: 'tasks.recurring',
  TASKS_BULK_OPERATIONS: 'tasks.bulk_operations',
  TASKS_ATTACHMENTS: 'tasks.attachments',
  TASKS_EMBEDS: 'tasks.embeds',
  TASKS_COMMENTS: 'tasks.comments',
  TASKS_ACTIVITY: 'tasks.activity',
  TASKS_COVER_IMAGES: 'tasks.cover_images',
  TASKS_EMAIL_INTAKE: 'tasks.email_intake',
  PROJECTS_TEMPLATES: 'projects.templates',

  // Views
  VIEWS_LIST: 'views.list',
  VIEWS_BOARD: 'views.board',
  VIEWS_CALENDAR: 'views.calendar',
  VIEWS_GANTT: 'views.gantt',
  VIEWS_TABLE: 'views.table',
  VIEWS_WORKLOAD: 'views.workload',
  VIEWS_DASHBOARD: 'views.dashboard',

  // Domains (top-level toggles)
  SPRINTS: 'sprints',
  GOALS: 'goals',
  DOCS: 'docs',
  FORMS: 'forms',

  // Chat
  CHAT: 'chat',
  CHAT_CHANNELS: 'chat.channels',
  CHAT_DM: 'chat.dm',
  CHAT_THREADS: 'chat.threads',
  CHAT_REACTIONS: 'chat.reactions',
  CHAT_PINS: 'chat.pins',
  CHAT_BOOKMARKS: 'chat.bookmarks',
  CHAT_FILE_SHARING: 'chat.file_sharing',
  CHAT_TASK_LINKING: 'chat.task_linking',
  CHAT_SEARCH: 'chat.search',
  CHAT_INBOX: 'chat.inbox',
  CHAT_CUSTOM_EMOJI: 'chat.custom_emoji',
  CHAT_SLASH_COMMANDS: 'chat.slash_commands',

  // AI
  AI: 'ai',
  AI_TASK_GENERATION: 'ai.task_generation',
  AI_MEETING_NOTES: 'ai.meeting_notes',
  AI_AUTO_PRIORITY: 'ai.auto_priority',
  AI_SMART_DEADLINES: 'ai.smart_deadlines',
  AI_SUMMARIES: 'ai.summaries',
  AI_CHATBOT: 'ai.chatbot',
  AI_AUTOMATIONS: 'ai.automations',
  AI_NL_COMMANDS: 'ai.nl_commands',
  AI_WRITING: 'ai.writing',
  AI_TASK_SUGGESTIONS: 'ai.task_suggestions',
  AI_DAILY_BRIEFINGS: 'ai.daily_briefings',
  AI_WORKLOAD_BALANCING: 'ai.workload_balancing',
  AI_PROJECT_HEALTH: 'ai.project_health',
  AI_CONTRIBUTION_ANALYTICS: 'ai.contribution_analytics',
  AI_SPRINT_PLANNING: 'ai.sprint_planning',

  // Time tracking
  TIME_TRACKING: 'time_tracking',
  TIME_TRACKING_MANUAL: 'time_tracking.manual',
  TIME_TRACKING_BILLABLE: 'time_tracking.billable',
  TIME_TRACKING_TIMESHEETS: 'time_tracking.timesheets',
  TIME_TRACKING_APPROVAL: 'time_tracking.approval',

  // The Teams hub's Analytics (ClickUp's Pulse ClickApp): off until an owner or admin turns it on.
  TEAMS_ANALYTICS: 'teams.analytics',
  // A task's comment box sends email (ClickUp's Email ClickApp): off until an owner or admin turns it on.
  TASK_EMAIL: 'tasks.email',
  // A task in more lists than its home one (ClickUp's Tasks in Multiple Lists ClickApp): off until an owner or admin turns it on.
  TASKS_IN_MULTIPLE_LISTS: 'tasks.multiple_lists',
  // Reporting
  REPORTING: 'reporting',
  REPORTING_PRODUCTIVITY: 'reporting.productivity',
  REPORTING_COMPLETION: 'reporting.completion',
  REPORTING_TIME: 'reporting.time',
  REPORTING_SPRINTS: 'reporting.sprints',
  REPORTING_GOALS: 'reporting.goals',
  REPORTING_CUSTOM: 'reporting.custom',

  // Notifications
  NOTIFICATIONS: 'notifications',
  NOTIFICATIONS_PUSH: 'notifications.push',
  NOTIFICATIONS_EMAIL: 'notifications.email',
  NOTIFICATIONS_REMINDERS: 'notifications.reminders',

  // Search & integrations
  SEARCH: 'search',
  INTEGRATIONS: 'integrations',
  INTEGRATIONS_SLACK: 'integrations.slack',
  INTEGRATIONS_GOOGLE_DRIVE: 'integrations.google_drive',
  INTEGRATIONS_GOOGLE_CALENDAR: 'integrations.google_calendar',
  INTEGRATIONS_WEBHOOKS: 'integrations.webhooks',
  INTEGRATIONS_CLICKUP_IMPORT: 'integrations.clickup_import',
  INTEGRATIONS_DROPBOX: 'integrations.dropbox',
  INTEGRATIONS_OUTLOOK_CALENDAR: 'integrations.outlook_calendar',
  INTEGRATIONS_GITHUB: 'integrations.github',
  INTEGRATIONS_MEETINGS: 'integrations.meetings',
  INTEGRATIONS_STRIPE: 'integrations.stripe',
  INTEGRATIONS_PUBLIC_API: 'integrations.public_api',

  // UI & platform
  UI_DARK_MODE: 'ui.dark_mode',
  UI_LANG_URDU: 'ui.lang_urdu',
  UI_LANG_ARABIC: 'ui.lang_arabic',
  SECURITY_AUDIT_TRAIL: 'security.audit_trail',
  SECURITY_DATA_EXPORT: 'security.data_export',
  SECURITY_ADVANCED: 'security.advanced',
  WORKSPACE_BRANDING: 'workspace.branding',
  MOBILE: 'mobile',
} as const

export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS]

export const FLAG_CATEGORIES: Record<string, FlagKey[]> = {
  auth: [FLAGS.AUTH_2FA, FLAGS.AUTH_SSO_GOOGLE, FLAGS.AUTH_SSO_MICROSOFT],
  core: [FLAGS.CORE_TASKS, FLAGS.TASKS_SUBTASKS, FLAGS.TASKS_CHECKLISTS, FLAGS.TASKS_CUSTOM_FIELDS, FLAGS.TASKS_DEPENDENCIES, FLAGS.TASKS_WATCHERS, FLAGS.TASKS_TEMPLATES, FLAGS.TASKS_RECURRING, FLAGS.TASKS_BULK_OPERATIONS, FLAGS.TASKS_ATTACHMENTS, FLAGS.TASKS_COMMENTS, FLAGS.TASKS_ACTIVITY, FLAGS.PROJECTS_TEMPLATES],
  views: [FLAGS.VIEWS_LIST, FLAGS.VIEWS_BOARD, FLAGS.VIEWS_CALENDAR, FLAGS.VIEWS_GANTT, FLAGS.VIEWS_TABLE, FLAGS.VIEWS_WORKLOAD, FLAGS.VIEWS_DASHBOARD],
  ai: [FLAGS.AI, FLAGS.AI_TASK_GENERATION, FLAGS.AI_MEETING_NOTES, FLAGS.AI_AUTO_PRIORITY, FLAGS.AI_SMART_DEADLINES, FLAGS.AI_SUMMARIES, FLAGS.AI_CHATBOT, FLAGS.AI_AUTOMATIONS, FLAGS.AI_NL_COMMANDS, FLAGS.AI_WRITING, FLAGS.AI_TASK_SUGGESTIONS, FLAGS.AI_DAILY_BRIEFINGS, FLAGS.AI_WORKLOAD_BALANCING, FLAGS.AI_PROJECT_HEALTH, FLAGS.AI_CONTRIBUTION_ANALYTICS, FLAGS.AI_SPRINT_PLANNING],
  chat: [FLAGS.CHAT, FLAGS.CHAT_CHANNELS, FLAGS.CHAT_DM, FLAGS.CHAT_THREADS, FLAGS.CHAT_REACTIONS, FLAGS.CHAT_PINS, FLAGS.CHAT_BOOKMARKS, FLAGS.CHAT_FILE_SHARING, FLAGS.CHAT_TASK_LINKING, FLAGS.CHAT_SEARCH, FLAGS.CHAT_INBOX],
  time_tracking: [FLAGS.TIME_TRACKING, FLAGS.TIME_TRACKING_MANUAL, FLAGS.TIME_TRACKING_BILLABLE, FLAGS.TIME_TRACKING_TIMESHEETS, FLAGS.TIME_TRACKING_APPROVAL],
  reporting: [FLAGS.REPORTING, FLAGS.REPORTING_PRODUCTIVITY, FLAGS.REPORTING_COMPLETION, FLAGS.REPORTING_TIME, FLAGS.REPORTING_SPRINTS, FLAGS.REPORTING_GOALS, FLAGS.REPORTING_CUSTOM],
  integrations: [FLAGS.INTEGRATIONS, FLAGS.INTEGRATIONS_SLACK, FLAGS.INTEGRATIONS_GOOGLE_DRIVE, FLAGS.INTEGRATIONS_GOOGLE_CALENDAR, FLAGS.INTEGRATIONS_WEBHOOKS, FLAGS.INTEGRATIONS_CLICKUP_IMPORT, FLAGS.INTEGRATIONS_GITHUB, FLAGS.INTEGRATIONS_MEETINGS, FLAGS.INTEGRATIONS_STRIPE, FLAGS.INTEGRATIONS_PUBLIC_API],
}

/**
 * G08-4 [08:43], [09:02] — what each signup pill actually governs.
 *
 * The wizard's second step says, in as many words: "Pick what you'll use —
 * we'll turn the rest off so the workspace stays uncluttered." The picks were
 * sent, declared on the DTO, and then read by nothing — `signUp()` never
 * looked at them — so that sentence was simply false.
 *
 * This mapping lives in the shared package rather than in either app because
 * BOTH ends need it and they must not drift: the wizard offers these pills,
 * and the server writes exactly the flags they name. A pill that governs
 * nothing would be a checkbox with no effect, which is the same defect wearing
 * a different hat.
 *
 * Only flags named here are touched at signup. Everything else — auth, SSO —
 * keeps its default, because nobody was asked about it.
 */
export const SIGNUP_FEATURE_FLAGS: Record<string, FlagKey[]> = {
  core: FLAG_CATEGORIES.core,
  views: FLAG_CATEGORIES.views,
  ai: FLAG_CATEGORIES.ai,
  chat: FLAG_CATEGORIES.chat,
  time_tracking: FLAG_CATEGORIES.time_tracking,
  reporting: FLAG_CATEGORIES.reporting,
  integrations: FLAG_CATEGORIES.integrations,
  // These four are single flags rather than categories; the pill and the flag
  // are the same thing.
  docs: [FLAGS.DOCS],
  goals: [FLAGS.GOALS],
  sprints: [FLAGS.SPRINTS],
  forms: [FLAGS.FORMS],
  mobile: [FLAGS.MOBILE],
}

// Flags that are on by default for all new workspaces
export const DEFAULT_ENABLED_FLAGS: FlagKey[] = [
  FLAGS.AUTH_SSO_GOOGLE,
  FLAGS.AUTH_SSO_MICROSOFT,
  FLAGS.CORE_TASKS,
  FLAGS.TASKS_SUBTASKS,
  FLAGS.TASKS_CHECKLISTS,
  FLAGS.TASKS_CUSTOM_FIELDS,
  FLAGS.TASKS_DEPENDENCIES,
  FLAGS.TASKS_WATCHERS,
  FLAGS.TASKS_TEMPLATES,
  FLAGS.TASKS_RECURRING,
  FLAGS.TASKS_BULK_OPERATIONS,
  FLAGS.TASKS_ATTACHMENTS,
  FLAGS.TASKS_COMMENTS,
  FLAGS.TASKS_ACTIVITY,
  FLAGS.PROJECTS_TEMPLATES,
  FLAGS.VIEWS_LIST,
  FLAGS.VIEWS_BOARD,
  FLAGS.VIEWS_CALENDAR,
  FLAGS.VIEWS_GANTT,
  FLAGS.VIEWS_TABLE,
  FLAGS.VIEWS_DASHBOARD,
  // Top-level domains that ship on for every workspace. Listed here so backend
  // FeatureFlagGuard treats them as enabled by default (it reads `?? false`),
  // matching the frontend gate — a workspace only loses them via an explicit
  // "off" override in Settings → Features.
  FLAGS.FORMS,
  FLAGS.GOALS,
  FLAGS.SPRINTS,
  FLAGS.CHAT,
  FLAGS.CHAT_CHANNELS,
  FLAGS.CHAT_DM,
  FLAGS.CHAT_THREADS,
  FLAGS.CHAT_REACTIONS,
  FLAGS.CHAT_PINS,
  FLAGS.CHAT_BOOKMARKS,
  FLAGS.CHAT_FILE_SHARING,
  FLAGS.CHAT_TASK_LINKING,
  FLAGS.CHAT_SEARCH,
  FLAGS.CHAT_INBOX,
  FLAGS.AI,
  FLAGS.AI_TASK_GENERATION,
  FLAGS.AI_MEETING_NOTES,
  FLAGS.AI_AUTO_PRIORITY,
  FLAGS.AI_SUMMARIES,
  FLAGS.AI_CHATBOT,
  FLAGS.AI_AUTOMATIONS,
  FLAGS.AI_WRITING,
  FLAGS.DOCS,
  FLAGS.TIME_TRACKING,
  FLAGS.TIME_TRACKING_MANUAL,
  FLAGS.TIME_TRACKING_BILLABLE,
  FLAGS.TIME_TRACKING_TIMESHEETS,
  FLAGS.REPORTING,
  FLAGS.REPORTING_PRODUCTIVITY,
  FLAGS.REPORTING_COMPLETION,
  FLAGS.REPORTING_TIME,
  FLAGS.REPORTING_CUSTOM,
  FLAGS.NOTIFICATIONS,
  FLAGS.NOTIFICATIONS_EMAIL,
  FLAGS.NOTIFICATIONS_REMINDERS,
  FLAGS.SEARCH,
  FLAGS.INTEGRATIONS,
  FLAGS.INTEGRATIONS_WEBHOOKS,
  FLAGS.INTEGRATIONS_CLICKUP_IMPORT,
  FLAGS.UI_DARK_MODE,
  FLAGS.SECURITY_AUDIT_TRAIL,
  FLAGS.SECURITY_DATA_EXPORT,
  FLAGS.MOBILE,
]
