import { pgTable, text, timestamp, uuid, boolean, integer, jsonb, primaryKey, index, check } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { lists } from './lists'
import { users } from './users'
import { viewTypeEnum } from './enums'

/**
 * Who can see a saved view, and who can change it.
 *
 * §V2-07, frames `10:36` and `11:14` — the Customize panel has "Private view"
 * and "Protect view" as two separate switches, because they answer two
 * different questions:
 *
 *   everyone   what every view was until now: visible to anyone who can open
 *              the list, and editable by them too.
 *   private    only its creator can see it at all. It is not in anyone else's
 *              tab strip, and asking for it by id is a 404 — the same answer
 *              they would get for a view that does not exist, because "you
 *              may not see this one" is itself a disclosure.
 *   protected  everyone sees it; only its creator and the workspace's
 *              managers can rename, reconfigure or delete it. This is the one
 *              that fixes a real hole: before this column existed, ANY member
 *              of a list could delete ANY view on it, including the default
 *              one everybody works in, and nothing recorded that they had.
 */
export type ViewVisibility = 'everyone' | 'private' | 'protected'

// A saved view on a list (ClickUp-style "List view", "Board view", etc.)
// config holds type-specific settings: { groupBy?, sortBy?, filters?, hiddenFields? }
export const taskViews = pgTable('task_views', {
  id:          uuid('id').primaryKey().defaultRandom(),
  listId:      uuid('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  name:        text('name').notNull(),
  type:        viewTypeEnum('type').notNull(),
  isDefault:   boolean('is_default').notNull().default(false),
  /** §V2-07 "Pin view" — pinned views sort ahead of the rest in the tab strip. */
  isPinned:    boolean('is_pinned').notNull().default(false),
  visibility:  text('visibility').$type<ViewVisibility>().notNull().default('everyone'),
  position:    integer('position').notNull().default(0),
  config:      jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Made by 0134. Declared here as well: a database built by
  // `drizzle-kit push` (the lanes, CI, a fresh deploy) reads only this file.
  check('chk_task_views_visibility', sql`${t.visibility} IN ('everyone', 'private', 'protected')`),
])

/**
 * §V2-07 "Autosave for me" — the one switch in that panel that is explicitly
 * per-user, and the frame says so in its own tooltip:
 *
 *   "Autosave will automatically save any layout changes you make to this
 *    view. Each user turns this on independently, but changes saved by
 *    Autosave will be seen by everyone."
 *
 * So the FLAG is per user and the SAVE is shared — which is exactly why it
 * cannot be a column on `task_views` (that would make one person's preference
 * everyone's) and cannot be browser storage either (the flag has to survive a
 * new laptop, and it is a real preference, not a remembered scroll position).
 */
export const taskViewPrefs = pgTable(
  'task_view_prefs',
  {
    viewId:    uuid('view_id').notNull().references(() => taskViews.id, { onDelete: 'cascade' }),
    userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    autosave:  boolean('autosave').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.viewId, t.userId] }),
    index('idx_task_view_prefs_user').on(t.userId),
  ],
)

export const taskViewsRelations = relations(taskViews, ({ one, many }) => ({
  list:    one(lists, { fields: [taskViews.listId], references: [lists.id] }),
  creator: one(users, { fields: [taskViews.createdById], references: [users.id] }),
  prefs:   many(taskViewPrefs),
}))

export const taskViewPrefsRelations = relations(taskViewPrefs, ({ one }) => ({
  view: one(taskViews, { fields: [taskViewPrefs.viewId], references: [taskViews.id] }),
  user: one(users, { fields: [taskViewPrefs.userId], references: [users.id] }),
}))
