import { pgTable, text, timestamp, uuid, boolean, integer, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

// Outbound webhooks — fire HTTP requests on platform events

export const webhooks = pgTable('webhooks', {
  id:          uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  name:        text('name').notNull(),
  url:         text('url').notNull(),
  secret:      text('secret'),        // HMAC signing secret
  isEnabled:   boolean('is_enabled').notNull().default(true),
  // events: ['task.created', 'task.status_changed', 'comment.created', ...]
  events:      jsonb('events').notNull().$type<string[]>().default([]),
  // delivery stats
  successCount: integer('success_count').notNull().default(0),
  failureCount: integer('failure_count').notNull().default(0),
  lastDeliveredAt: timestamp('last_delivered_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id:          uuid('id').primaryKey().defaultRandom(),
  webhookId:   uuid('webhook_id').notNull().references(() => webhooks.id, { onDelete: 'cascade' }),
  event:       text('event').notNull(),
  payload:     jsonb('payload'),
  statusCode:  integer('status_code'),
  responseBody: text('response_body'),
  duration:    integer('duration'),  // ms total across all attempts
  attempts:    integer('attempts').notNull().default(1),
  success:     boolean('success').notNull().default(false),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }).notNull().defaultNow(),
})

export const webhooksRelations = relations(webhooks, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [webhooks.workspaceId], references: [workspaces.id] }),
  createdBy: one(users, { fields: [webhooks.createdById], references: [users.id] }),
  deliveries: many(webhookDeliveries),
}))

export const webhookDeliveriesRelations = relations(webhookDeliveries, ({ one }) => ({
  webhook: one(webhooks, { fields: [webhookDeliveries.webhookId], references: [webhooks.id] }),
}))
