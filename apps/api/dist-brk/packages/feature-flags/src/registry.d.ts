export declare const FLAGS: {
    readonly AUTH_2FA: "auth.2fa";
    readonly AUTH_SSO_GOOGLE: "auth.sso_google";
    readonly AUTH_SSO_MICROSOFT: "auth.sso_microsoft";
    readonly CORE_TASKS: "core.tasks";
    readonly TASKS_SUBTASKS: "tasks.subtasks";
    readonly TASKS_CHECKLISTS: "tasks.checklists";
    readonly TASKS_CUSTOM_FIELDS: "tasks.custom_fields";
    readonly TASKS_DEPENDENCIES: "tasks.dependencies";
    readonly TASKS_WATCHERS: "tasks.watchers";
    readonly TASKS_TEMPLATES: "tasks.templates";
    readonly TASKS_RECURRING: "tasks.recurring";
    readonly TASKS_BULK_OPERATIONS: "tasks.bulk_operations";
    readonly TASKS_ATTACHMENTS: "tasks.attachments";
    readonly TASKS_EMBEDS: "tasks.embeds";
    readonly TASKS_COMMENTS: "tasks.comments";
    readonly TASKS_ACTIVITY: "tasks.activity";
    readonly TASKS_COVER_IMAGES: "tasks.cover_images";
    readonly TASKS_EMAIL_INTAKE: "tasks.email_intake";
    readonly PROJECTS_TEMPLATES: "projects.templates";
    readonly VIEWS_LIST: "views.list";
    readonly VIEWS_BOARD: "views.board";
    readonly VIEWS_CALENDAR: "views.calendar";
    readonly VIEWS_GANTT: "views.gantt";
    readonly VIEWS_TABLE: "views.table";
    readonly VIEWS_WORKLOAD: "views.workload";
    readonly VIEWS_DASHBOARD: "views.dashboard";
    readonly SPRINTS: "sprints";
    readonly GOALS: "goals";
    readonly DOCS: "docs";
    readonly FORMS: "forms";
    readonly CHAT: "chat";
    readonly CHAT_CHANNELS: "chat.channels";
    readonly CHAT_DM: "chat.dm";
    readonly CHAT_THREADS: "chat.threads";
    readonly CHAT_REACTIONS: "chat.reactions";
    readonly CHAT_PINS: "chat.pins";
    readonly CHAT_BOOKMARKS: "chat.bookmarks";
    readonly CHAT_FILE_SHARING: "chat.file_sharing";
    readonly CHAT_TASK_LINKING: "chat.task_linking";
    readonly CHAT_SEARCH: "chat.search";
    readonly CHAT_INBOX: "chat.inbox";
    readonly CHAT_ANNOUNCEMENTS: "chat.announcements";
    readonly CHAT_CUSTOM_EMOJI: "chat.custom_emoji";
    readonly CHAT_SLASH_COMMANDS: "chat.slash_commands";
    readonly AI: "ai";
    readonly AI_TASK_GENERATION: "ai.task_generation";
    readonly AI_MEETING_NOTES: "ai.meeting_notes";
    readonly AI_AUTO_PRIORITY: "ai.auto_priority";
    readonly AI_SMART_DEADLINES: "ai.smart_deadlines";
    readonly AI_SUMMARIES: "ai.summaries";
    readonly AI_CHATBOT: "ai.chatbot";
    readonly AI_AUTOMATIONS: "ai.automations";
    readonly AI_NL_COMMANDS: "ai.nl_commands";
    readonly AI_WRITING: "ai.writing";
    readonly AI_TASK_SUGGESTIONS: "ai.task_suggestions";
    readonly AI_DAILY_BRIEFINGS: "ai.daily_briefings";
    readonly AI_WORKLOAD_BALANCING: "ai.workload_balancing";
    readonly AI_PROJECT_HEALTH: "ai.project_health";
    readonly AI_CONTRIBUTION_ANALYTICS: "ai.contribution_analytics";
    readonly AI_SPRINT_PLANNING: "ai.sprint_planning";
    readonly TIME_TRACKING: "time_tracking";
    readonly TIME_TRACKING_MANUAL: "time_tracking.manual";
    readonly TIME_TRACKING_BILLABLE: "time_tracking.billable";
    readonly TIME_TRACKING_TIMESHEETS: "time_tracking.timesheets";
    readonly TIME_TRACKING_APPROVAL: "time_tracking.approval";
    readonly REPORTING: "reporting";
    readonly REPORTING_PRODUCTIVITY: "reporting.productivity";
    readonly REPORTING_COMPLETION: "reporting.completion";
    readonly REPORTING_TIME: "reporting.time";
    readonly REPORTING_SPRINTS: "reporting.sprints";
    readonly REPORTING_GOALS: "reporting.goals";
    readonly REPORTING_CUSTOM: "reporting.custom";
    readonly NOTIFICATIONS: "notifications";
    readonly NOTIFICATIONS_PUSH: "notifications.push";
    readonly NOTIFICATIONS_EMAIL: "notifications.email";
    readonly NOTIFICATIONS_REMINDERS: "notifications.reminders";
    readonly SEARCH: "search";
    readonly INTEGRATIONS: "integrations";
    readonly INTEGRATIONS_SLACK: "integrations.slack";
    readonly INTEGRATIONS_GOOGLE_DRIVE: "integrations.google_drive";
    readonly INTEGRATIONS_GOOGLE_CALENDAR: "integrations.google_calendar";
    readonly INTEGRATIONS_WEBHOOKS: "integrations.webhooks";
    readonly INTEGRATIONS_CLICKUP_IMPORT: "integrations.clickup_import";
    readonly INTEGRATIONS_DROPBOX: "integrations.dropbox";
    readonly INTEGRATIONS_OUTLOOK_CALENDAR: "integrations.outlook_calendar";
    readonly INTEGRATIONS_GITHUB: "integrations.github";
    readonly INTEGRATIONS_MEETINGS: "integrations.meetings";
    readonly INTEGRATIONS_STRIPE: "integrations.stripe";
    readonly INTEGRATIONS_PUBLIC_API: "integrations.public_api";
    readonly UI_DARK_MODE: "ui.dark_mode";
    readonly UI_LANG_URDU: "ui.lang_urdu";
    readonly UI_LANG_ARABIC: "ui.lang_arabic";
    readonly SECURITY_AUDIT_TRAIL: "security.audit_trail";
    readonly SECURITY_DATA_EXPORT: "security.data_export";
    readonly SECURITY_ADVANCED: "security.advanced";
    readonly WORKSPACE_BRANDING: "workspace.branding";
    readonly MOBILE: "mobile";
};
export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS];
export declare const FLAG_CATEGORIES: Record<string, FlagKey[]>;
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
export declare const SIGNUP_FEATURE_FLAGS: Record<string, FlagKey[]>;
export declare const DEFAULT_ENABLED_FLAGS: FlagKey[];
