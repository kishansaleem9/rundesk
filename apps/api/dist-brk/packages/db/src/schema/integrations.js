"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slackIntegrationsRelations = exports.slackRoutingRulesRelations = exports.slackRoutingRules = exports.slackIntegrations = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
/**
 * Slack incoming-webhook integrations. We store the user-supplied webhook
 * URL (which already encodes channel + auth) — no full OAuth flow required.
 * One row per workspace (we enforce this in the service layer).
 */
exports.slackIntegrations = (0, pg_core_1.pgTable)('slack_integrations', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    webhookUrl: (0, pg_core_1.text)('webhook_url').notNull(),
    channelName: (0, pg_core_1.text)('channel_name'),
    isEnabled: (0, pg_core_1.boolean)('is_enabled').notNull().default(true),
    // Pre-filtered event types this integration cares about. Empty array = all events.
    eventFilters: (0, pg_core_1.text)('event_filters').array().notNull().default([]),
    successCount: (0, pg_core_1.integer)('success_count').notNull().default(0),
    failureCount: (0, pg_core_1.integer)('failure_count').notNull().default(0),
    lastNotifiedAt: (0, pg_core_1.timestamp)('last_notified_at', { withTimezone: true }),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
/**
 * Per-channel Slack routing rules (Plan §12): route events (optionally scoped to
 * one project) to different Slack channels/webhooks, in addition to the single
 * default integration above. projectId FK is declared in the migration to avoid
 * a projects<->integrations import cycle.
 */
exports.slackRoutingRules = (0, pg_core_1.pgTable)('slack_routing_rules', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    webhookUrl: (0, pg_core_1.text)('webhook_url').notNull(),
    channelName: (0, pg_core_1.text)('channel_name'),
    // Null = every project; otherwise only events for this project.
    projectId: (0, pg_core_1.uuid)('project_id'),
    eventFilters: (0, pg_core_1.text)('event_filters').array().notNull().default([]),
    isEnabled: (0, pg_core_1.boolean)('is_enabled').notNull().default(true),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.slackRoutingRulesRelations = (0, drizzle_orm_1.relations)(exports.slackRoutingRules, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.slackRoutingRules.workspaceId], references: [workspaces_1.workspaces.id] }),
}));
exports.slackIntegrationsRelations = (0, drizzle_orm_1.relations)(exports.slackIntegrations, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, {
        fields: [exports.slackIntegrations.workspaceId],
        references: [workspaces_1.workspaces.id],
    }),
    createdBy: one(users_1.users, {
        fields: [exports.slackIntegrations.createdById],
        references: [users_1.users.id],
    }),
}));
//# sourceMappingURL=integrations.js.map