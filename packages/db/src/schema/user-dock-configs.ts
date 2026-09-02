import { pgTable, uuid, jsonb, timestamp } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'
import { workspaces } from './workspaces'

export const userDockConfigs = pgTable('user_dock_configs', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  pinnedLinks: jsonb('pinned_links').notNull().default([]),
  /**
   * G04-7 [05:29] / G07-6 [08:26–08:31] — the sidebar arrangement, on the
   * account rather than the browser.
   *
   * Both lived in localStorage while everything else about a user — theme,
   * locale, notification preferences, and the dock appearance sitting in this
   * very row — was server-persisted. So it was an inconsistency rather than a
   * decision: sign in on another machine, or open a private window, and a
   * sidebar somebody had arranged reverted to four hard-coded defaults.
   *
   * Null, not `[]`, because "never arranged it" and "arranged it to be empty"
   * are different answers and only the first should get the defaults.
   */
  navFavorites: jsonb('nav_favorites').$type<Array<{ label: string; path: string }> | null>(),
  navRecents:  jsonb('nav_recents').$type<Array<{ label: string; path: string; kind?: string }> | null>(),
  appearance:  jsonb('appearance').notNull().default({
    size: 'md',
    opacity: 0.8,
    theme: 'system'
  }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const userDockConfigsRelations = relations(userDockConfigs, ({ one }) => ({
  user:      one(users, { fields: [userDockConfigs.userId], references: [users.id] }),
  workspace: one(workspaces, { fields: [userDockConfigs.workspaceId], references: [workspaces.id] }),
}))
