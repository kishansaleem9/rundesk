import { pgTable, text, timestamp, uuid, boolean } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { lists } from './lists'
import { users } from './users'

// A per-list inbound webhook (Plan §12): external systems POST JSON to
// /inbound/webhook/:token to create a task in the mapped list.
export const inboundWebhooks = pgTable('inbound_webhooks', {
  id:          uuid('id').primaryKey().defaultRandom(),
  listId:      uuid('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
  token:       text('token').notNull().unique(),
  name:        text('name').notNull(),
  isEnabled:   boolean('is_enabled').notNull().default(true),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const inboundWebhooksRelations = relations(inboundWebhooks, ({ one }) => ({
  list:    one(lists, { fields: [inboundWebhooks.listId], references: [lists.id] }),
  creator: one(users, { fields: [inboundWebhooks.createdById], references: [users.id] }),
}))
