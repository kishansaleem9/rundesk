"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ENABLED_FLAGS = exports.SIGNUP_FEATURE_FLAGS = exports.FLAG_CATEGORIES = exports.FLAGS = void 0;
exports.FLAGS = {
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
    CHAT_ANNOUNCEMENTS: 'chat.announcements',
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
};
exports.FLAG_CATEGORIES = {
    auth: [exports.FLAGS.AUTH_2FA, exports.FLAGS.AUTH_SSO_GOOGLE, exports.FLAGS.AUTH_SSO_MICROSOFT],
    core: [exports.FLAGS.CORE_TASKS, exports.FLAGS.TASKS_SUBTASKS, exports.FLAGS.TASKS_CHECKLISTS, exports.FLAGS.TASKS_CUSTOM_FIELDS, exports.FLAGS.TASKS_DEPENDENCIES, exports.FLAGS.TASKS_WATCHERS, exports.FLAGS.TASKS_TEMPLATES, exports.FLAGS.TASKS_RECURRING, exports.FLAGS.TASKS_BULK_OPERATIONS, exports.FLAGS.TASKS_ATTACHMENTS, exports.FLAGS.TASKS_COMMENTS, exports.FLAGS.TASKS_ACTIVITY, exports.FLAGS.PROJECTS_TEMPLATES],
    views: [exports.FLAGS.VIEWS_LIST, exports.FLAGS.VIEWS_BOARD, exports.FLAGS.VIEWS_CALENDAR, exports.FLAGS.VIEWS_GANTT, exports.FLAGS.VIEWS_TABLE, exports.FLAGS.VIEWS_WORKLOAD, exports.FLAGS.VIEWS_DASHBOARD],
    ai: [exports.FLAGS.AI, exports.FLAGS.AI_TASK_GENERATION, exports.FLAGS.AI_MEETING_NOTES, exports.FLAGS.AI_AUTO_PRIORITY, exports.FLAGS.AI_SMART_DEADLINES, exports.FLAGS.AI_SUMMARIES, exports.FLAGS.AI_CHATBOT, exports.FLAGS.AI_AUTOMATIONS, exports.FLAGS.AI_NL_COMMANDS, exports.FLAGS.AI_WRITING, exports.FLAGS.AI_TASK_SUGGESTIONS, exports.FLAGS.AI_DAILY_BRIEFINGS, exports.FLAGS.AI_WORKLOAD_BALANCING, exports.FLAGS.AI_PROJECT_HEALTH, exports.FLAGS.AI_CONTRIBUTION_ANALYTICS, exports.FLAGS.AI_SPRINT_PLANNING],
    chat: [exports.FLAGS.CHAT, exports.FLAGS.CHAT_CHANNELS, exports.FLAGS.CHAT_DM, exports.FLAGS.CHAT_THREADS, exports.FLAGS.CHAT_REACTIONS, exports.FLAGS.CHAT_PINS, exports.FLAGS.CHAT_BOOKMARKS, exports.FLAGS.CHAT_FILE_SHARING, exports.FLAGS.CHAT_TASK_LINKING, exports.FLAGS.CHAT_SEARCH, exports.FLAGS.CHAT_INBOX, exports.FLAGS.CHAT_ANNOUNCEMENTS],
    time_tracking: [exports.FLAGS.TIME_TRACKING, exports.FLAGS.TIME_TRACKING_MANUAL, exports.FLAGS.TIME_TRACKING_BILLABLE, exports.FLAGS.TIME_TRACKING_TIMESHEETS, exports.FLAGS.TIME_TRACKING_APPROVAL],
    reporting: [exports.FLAGS.REPORTING, exports.FLAGS.REPORTING_PRODUCTIVITY, exports.FLAGS.REPORTING_COMPLETION, exports.FLAGS.REPORTING_TIME, exports.FLAGS.REPORTING_SPRINTS, exports.FLAGS.REPORTING_GOALS, exports.FLAGS.REPORTING_CUSTOM],
    integrations: [exports.FLAGS.INTEGRATIONS, exports.FLAGS.INTEGRATIONS_SLACK, exports.FLAGS.INTEGRATIONS_GOOGLE_DRIVE, exports.FLAGS.INTEGRATIONS_GOOGLE_CALENDAR, exports.FLAGS.INTEGRATIONS_WEBHOOKS, exports.FLAGS.INTEGRATIONS_CLICKUP_IMPORT, exports.FLAGS.INTEGRATIONS_GITHUB, exports.FLAGS.INTEGRATIONS_MEETINGS, exports.FLAGS.INTEGRATIONS_STRIPE, exports.FLAGS.INTEGRATIONS_PUBLIC_API],
};
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
exports.SIGNUP_FEATURE_FLAGS = {
    core: exports.FLAG_CATEGORIES.core,
    views: exports.FLAG_CATEGORIES.views,
    ai: exports.FLAG_CATEGORIES.ai,
    chat: exports.FLAG_CATEGORIES.chat,
    time_tracking: exports.FLAG_CATEGORIES.time_tracking,
    reporting: exports.FLAG_CATEGORIES.reporting,
    integrations: exports.FLAG_CATEGORIES.integrations,
    // These four are single flags rather than categories; the pill and the flag
    // are the same thing.
    docs: [exports.FLAGS.DOCS],
    goals: [exports.FLAGS.GOALS],
    sprints: [exports.FLAGS.SPRINTS],
    forms: [exports.FLAGS.FORMS],
    mobile: [exports.FLAGS.MOBILE],
};
// Flags that are on by default for all new workspaces
exports.DEFAULT_ENABLED_FLAGS = [
    exports.FLAGS.AUTH_SSO_GOOGLE,
    exports.FLAGS.AUTH_SSO_MICROSOFT,
    exports.FLAGS.CORE_TASKS,
    exports.FLAGS.TASKS_SUBTASKS,
    exports.FLAGS.TASKS_CHECKLISTS,
    exports.FLAGS.TASKS_CUSTOM_FIELDS,
    exports.FLAGS.TASKS_DEPENDENCIES,
    exports.FLAGS.TASKS_WATCHERS,
    exports.FLAGS.TASKS_TEMPLATES,
    exports.FLAGS.TASKS_RECURRING,
    exports.FLAGS.TASKS_BULK_OPERATIONS,
    exports.FLAGS.TASKS_ATTACHMENTS,
    exports.FLAGS.TASKS_COMMENTS,
    exports.FLAGS.TASKS_ACTIVITY,
    exports.FLAGS.PROJECTS_TEMPLATES,
    exports.FLAGS.VIEWS_LIST,
    exports.FLAGS.VIEWS_BOARD,
    exports.FLAGS.VIEWS_CALENDAR,
    exports.FLAGS.VIEWS_GANTT,
    exports.FLAGS.VIEWS_TABLE,
    exports.FLAGS.VIEWS_DASHBOARD,
    // Top-level domains that ship on for every workspace. Listed here so backend
    // FeatureFlagGuard treats them as enabled by default (it reads `?? false`),
    // matching the frontend gate — a workspace only loses them via an explicit
    // "off" override in Settings → Features.
    exports.FLAGS.FORMS,
    exports.FLAGS.GOALS,
    exports.FLAGS.SPRINTS,
    exports.FLAGS.CHAT,
    exports.FLAGS.CHAT_CHANNELS,
    exports.FLAGS.CHAT_DM,
    exports.FLAGS.CHAT_THREADS,
    exports.FLAGS.CHAT_REACTIONS,
    exports.FLAGS.CHAT_PINS,
    exports.FLAGS.CHAT_BOOKMARKS,
    exports.FLAGS.CHAT_FILE_SHARING,
    exports.FLAGS.CHAT_TASK_LINKING,
    exports.FLAGS.CHAT_SEARCH,
    exports.FLAGS.CHAT_INBOX,
    exports.FLAGS.AI,
    exports.FLAGS.AI_TASK_GENERATION,
    exports.FLAGS.AI_MEETING_NOTES,
    exports.FLAGS.AI_AUTO_PRIORITY,
    exports.FLAGS.AI_SUMMARIES,
    exports.FLAGS.AI_CHATBOT,
    exports.FLAGS.AI_AUTOMATIONS,
    exports.FLAGS.AI_WRITING,
    exports.FLAGS.DOCS,
    exports.FLAGS.TIME_TRACKING,
    exports.FLAGS.TIME_TRACKING_MANUAL,
    exports.FLAGS.TIME_TRACKING_BILLABLE,
    exports.FLAGS.TIME_TRACKING_TIMESHEETS,
    exports.FLAGS.REPORTING,
    exports.FLAGS.REPORTING_PRODUCTIVITY,
    exports.FLAGS.REPORTING_COMPLETION,
    exports.FLAGS.REPORTING_TIME,
    exports.FLAGS.REPORTING_CUSTOM,
    exports.FLAGS.NOTIFICATIONS,
    exports.FLAGS.NOTIFICATIONS_EMAIL,
    exports.FLAGS.NOTIFICATIONS_REMINDERS,
    exports.FLAGS.SEARCH,
    exports.FLAGS.INTEGRATIONS,
    exports.FLAGS.INTEGRATIONS_WEBHOOKS,
    exports.FLAGS.INTEGRATIONS_CLICKUP_IMPORT,
    exports.FLAGS.UI_DARK_MODE,
    exports.FLAGS.SECURITY_AUDIT_TRAIL,
    exports.FLAGS.SECURITY_DATA_EXPORT,
    exports.FLAGS.MOBILE,
];
//# sourceMappingURL=registry.js.map