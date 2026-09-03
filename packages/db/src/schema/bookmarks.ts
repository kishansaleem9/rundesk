import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'
import { workspaces } from './workspaces'

/**
 * §G01-9 [00:35] — the Overview's "Bookmarks" card.
 *
 * > "Bookmarks make it easy to save ClickUp items or any URL from around the
 * >  web." + "Add Bookmark"
 *
 * Deliberately NOT folded into the existing favourites, which is the obvious
 * shortcut and the wrong one. `user_dock_configs.navFavorites` holds
 * `{ label, path }` — internal nav paths, resolved by the router. The whole
 * point of a bookmark is "**or any URL from around the web**": a favourite that
 * pointed at `https://…` would be handed to `navigate()` and go nowhere, which
 * is the shape this audit has already found twice.
 *
 * Per person, per workspace. A bookmark is somebody's own shortlist — the
 * spec's card sits in their Overview — and a shared one would need permissions,
 * ownership and a story for what happens when the person leaves.
 */
export const workspaceBookmarks = pgTable(
  'workspace_bookmarks',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** What to call it. Falls back to the URL when somebody saves without one. */
    title:       text('title').notNull(),
    /**
     * Where it goes. Either an in-app path ("/app/…") or an absolute http(s)
     * URL — the second is the reason this table exists. Validated on the way in
     * rather than trusted: a `javascript:` bookmark is a script on this origin.
     */
    url:         text('url').notNull(),
    position:    integer('position').notNull().default(0),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_workspace_bookmarks_owner').on(t.workspaceId, t.userId, t.position)],
)
