import { pgTable, text, timestamp, uuid, jsonb, unique, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { lists } from './lists'
import { users } from './users'

/**
 * §V2-07 "Saved filters" — frame `11:41`, top-right of the Filters panel.
 *
 * A named set of filter rules on one list, re-appliable in a click. Distinct
 * from a saved VIEW, which also remembers the layout (which view type, which
 * columns, how it is grouped and sorted): a saved filter is only the question
 * "which tasks", which is why it can be applied on top of whatever view you
 * happen to be in.
 *
 * PER USER, deliberately, matching `saved_searches` — the app's existing
 * answer to "a filter set I saved". A shared one would mean a teammate can
 * delete the filter you use every morning, and nothing in the video says these
 * are shared.
 *
 * Its own table rather than a `list_id` on `saved_searches`: that column would
 * have to be nullable to leave the command palette's presets alone, and a
 * nullable column inside the unique key that palette upserts on is a real
 * behaviour change (Postgres treats NULLs as distinct) for no gain.
 */
export const listFilterPresets = pgTable(
  'list_filter_presets',
  {
    id:        uuid('id').primaryKey().defaultRandom(),
    listId:    uuid('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
    userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name:      text('name').notNull(),
    /** The filter tree: `FilterNode[]`, leaves and one level of groups. */
    rules:     jsonb('rules').$type<unknown[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Saving under a name you already used replaces it, which is what "save"
    // means to the person doing it.
    unique('uq_list_filter_presets_name').on(t.listId, t.userId, t.name),
    index('idx_list_filter_presets_list_user').on(t.listId, t.userId),
  ],
)

export const listFilterPresetsRelations = relations(listFilterPresets, ({ one }) => ({
  list: one(lists, { fields: [listFilterPresets.listId], references: [lists.id] }),
  user: one(users, { fields: [listFilterPresets.userId], references: [users.id] }),
}))
