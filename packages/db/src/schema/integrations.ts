import { pgTable, text, timestamp, boolean, uuid, integer } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

/**
 * Slack incoming-webhook integrations. We store the user-supplied webhook
 * URL (which already encodes channel + auth) — no full OAuth flow required.
 * One row per workspace (we enforce this in the service layer).
 */
export const slackIntegrations = pgTable('slack_integrations', {
  id:           uuid('id').primaryKey().defaultRandom(),
  workspaceId:  uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  webhookUrl:   text('webhook_url').notNull(),
  channelName:  text('channel_name'),
  isEnabled:    boolean('is_enabled').notNull().default(true),
  // Pre-filtered event types this integration cares about. Empty array = all events.
  eventFilters: text('event_filters').array().notNull().default([]),
  successCount: integer('success_count').notNull().default(0),
  failureCount: integer('failure_count').notNull().default(0),
  lastNotifiedAt: timestamp('last_notified_at', { withTimezone: true }),
  createdById:  uuid('created_by_id').references(() => users.id),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const slackIntegrationsRelations = relations(slackIntegrations, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [slackIntegrations.workspaceId],
    references: [workspaces.id],
  }),
  createdBy: one(users, {
    fields: [slackIntegrations.createdById],
    references: [users.id],
  }),
}))
