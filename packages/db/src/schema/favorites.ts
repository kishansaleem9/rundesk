import { pgTable, text, timestamp, uuid, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

/**
 * A user's pinned items for quick navigation (Plan §2 quick-access sidebar).
 * Polymorphic by (entityType, entityId) so any surface — space, list, task,
 * doc, or chat channel — can be favorited without a table per type. The target
 * is intentionally not FK-constrained (it spans five tables); dangling rows are
 * skipped and pruned at read time.
 */
export const favorites = pgTable(
  'favorites',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    entityType:  text('entity_type').$type<'space' | 'list' | 'task' | 'doc' | 'channel'>().notNull(),
    entityId:    uuid('entity_id').notNull(),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqFavorite: uniqueIndex('favorites_user_entity_unique').on(t.userId, t.entityType, t.entityId),
    byUserWorkspace: index('favorites_user_workspace_idx').on(t.userId, t.workspaceId),
  }),
)

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user:      one(users, { fields: [favorites.userId], references: [users.id] }),
  workspace: one(workspaces, { fields: [favorites.workspaceId], references: [workspaces.id] }),
}))
