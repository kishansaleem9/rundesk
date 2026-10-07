import { pgTable, text, timestamp, uuid, integer, unique, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { lists } from './lists'
import type { StatusCategory } from './tasks'
import { clickupImportJobs } from './clickup-import-jobs'

/**
 * Per-list custom status pipeline.
 *
 * Every list gets a default set of 6 statuses seeded at migration time
 * (Backlog, To do, In progress, In review, Done, Cancelled) so the
 * existing enum-based tasks keep working. Owners can rename, recolour,
 * reorder, add, or delete them via the list settings.
 *
 * `key` is the stable identifier persisted on `tasks.status` — renaming
 * the user-facing `name` does NOT migrate task rows. Deleting a status
 * is only allowed once all tasks have been reassigned to another status
 * (enforced in the service layer).
 *
 * `category` buckets the status into open / in_progress / closed so
 * reports, automations, and burndown charts can keep working even after
 * the user customises the pipeline.
 */
export const listStatuses = pgTable(
  'list_statuses',
  {
    id:        uuid('id').primaryKey().defaultRandom(),
    listId:    uuid('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
    key:       text('key').notNull(),
    name:      text('name').notNull(),
    color:     text('color').notNull().default('#94a3b8'),
    category:  text('category').$type<StatusCategory>().notNull().default('open'),
    position:  integer('position').notNull().default(0),
    // Which import made this row (Settings › Imports / Exports); null for everything else.
    importId: uuid('import_id').references(() => clickupImportJobs.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_list_statuses_list_key').on(t.listId, t.key),
    index('idx_list_statuses_list_position').on(t.listId, t.position),
  ],
)

export const listStatusesRelations = relations(listStatuses, ({ one }) => ({
  list: one(lists, { fields: [listStatuses.listId], references: [lists.id] }),
}))
