"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookDeliveriesRelations = exports.webhooksRelations = exports.webhookDeliveries = exports.webhooks = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
// Outbound webhooks — fire HTTP requests on platform events
exports.webhooks = (0, pg_core_1.pgTable)('webhooks', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    name: (0, pg_core_1.text)('name').notNull(),
    url: (0, pg_core_1.text)('url').notNull(),
    secret: (0, pg_core_1.text)('secret'), // HMAC signing secret
    isEnabled: (0, pg_core_1.boolean)('is_enabled').notNull().default(true),
    // events: ['task.created', 'task.status_changed', 'comment.created', ...]
    events: (0, pg_core_1.jsonb)('events').notNull().$type().default([]),
    // delivery stats
    successCount: (0, pg_core_1.integer)('success_count').notNull().default(0),
    failureCount: (0, pg_core_1.integer)('failure_count').notNull().default(0),
    lastDeliveredAt: (0, pg_core_1.timestamp)('last_delivered_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.webhookDeliveries = (0, pg_core_1.pgTable)('webhook_deliveries', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    webhookId: (0, pg_core_1.uuid)('webhook_id').notNull().references(() => exports.webhooks.id, { onDelete: 'cascade' }),
    event: (0, pg_core_1.text)('event').notNull(),
    payload: (0, pg_core_1.jsonb)('payload'),
    statusCode: (0, pg_core_1.integer)('status_code'),
    responseBody: (0, pg_core_1.text)('response_body'),
    duration: (0, pg_core_1.integer)('duration'), // ms total across all attempts
    attempts: (0, pg_core_1.integer)('attempts').notNull().default(1),
    success: (0, pg_core_1.boolean)('success').notNull().default(false),
    deliveredAt: (0, pg_core_1.timestamp)('delivered_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.webhooksRelations = (0, drizzle_orm_1.relations)(exports.webhooks, ({ one, many }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.webhooks.workspaceId], references: [workspaces_1.workspaces.id] }),
    createdBy: one(users_1.users, { fields: [exports.webhooks.createdById], references: [users_1.users.id] }),
    deliveries: many(exports.webhookDeliveries),
}));
exports.webhookDeliveriesRelations = (0, drizzle_orm_1.relations)(exports.webhookDeliveries, ({ one }) => ({
    webhook: one(exports.webhooks, { fields: [exports.webhookDeliveries.webhookId], references: [exports.webhooks.id] }),
}));
//# sourceMappingURL=webhooks.js.map