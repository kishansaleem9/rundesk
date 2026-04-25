import { pgTable, text, timestamp, uuid, boolean, integer, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { lists } from './lists'
import { users } from './users'
import { viewTypeEnum } from './enums'

// A saved view on a list (ClickUp-style "List view", "Board view", etc.)
// config holds type-specific settings: { groupBy?, sortBy?, filters?, hiddenFields? }
export const taskViews = pgTable('task_views', {
  id:          uuid('id').primaryKey().defaultRandom(),
  listId:      uuid('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  name:        text('name').notNull(),
  type:        viewTypeEnum('type').notNull(),
  isDefault:   boolean('is_default').notNull().default(false),
  position:    integer('position').notNull().default(0),
  config:      jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const taskViewsRelations = relations(taskViews, ({ one }) => ({
  list:    one(lists, { fields: [taskViews.listId], references: [lists.id] }),
  creator: one(users, { fields: [taskViews.createdById], references: [users.id] }),
}))
