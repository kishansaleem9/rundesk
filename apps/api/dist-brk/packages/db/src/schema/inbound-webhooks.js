"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inboundWebhooksRelations = exports.inboundWebhooks = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const lists_1 = require("./lists");
const users_1 = require("./users");
// A per-list inbound webhook (Plan §12): external systems POST JSON to
// /inbound/webhook/:token to create a task in the mapped list.
exports.inboundWebhooks = (0, pg_core_1.pgTable)('inbound_webhooks', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    listId: (0, pg_core_1.uuid)('list_id').notNull().references(() => lists_1.lists.id, { onDelete: 'cascade' }),
    token: (0, pg_core_1.text)('token').notNull().unique(),
    name: (0, pg_core_1.text)('name').notNull(),
    isEnabled: (0, pg_core_1.boolean)('is_enabled').notNull().default(true),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.inboundWebhooksRelations = (0, drizzle_orm_1.relations)(exports.inboundWebhooks, ({ one }) => ({
    list: one(lists_1.lists, { fields: [exports.inboundWebhooks.listId], references: [lists_1.lists.id] }),
    creator: one(users_1.users, { fields: [exports.inboundWebhooks.createdById], references: [users_1.users.id] }),
}));
//# sourceMappingURL=inbound-webhooks.js.map