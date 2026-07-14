import { pgTable, text, timestamp, uuid, jsonb, unique, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

/**
 * A user's saved search filter preset (Plan §11.2). Scoped to a user +
 * workspace; `filters` mirrors the SearchFilters shape (types, statusCategory,
 * priority, assigneeId, labelId, dueAfter/dueBefore).
 */
export const savedSearches = pgTable(
  'saved_searches',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name:        text('name').notNull(),
    query:       text('query'),
    filters:     jsonb('filters').$type<Record<string, unknown>>().notNull().default({}),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_saved_searches_user_ws_name').on(t.userId, t.workspaceId, t.name),
    index('idx_saved_searches_user_ws').on(t.userId, t.workspaceId),
  ],
)

export const savedSearchesRelations = relations(savedSearches, ({ one }) => ({
  workspace: one(workspaces, { fields: [savedSearches.workspaceId], references: [workspaces.id] }),
  user:      one(users, { fields: [savedSearches.userId], references: [users.id] }),
}))
