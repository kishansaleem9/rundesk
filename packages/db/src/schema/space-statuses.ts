import { pgTable, text, timestamp, uuid, integer, unique, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { spaces } from './spaces'
import type { StatusCategory } from './tasks'

/**
 * Space-scoped status template (see 0036_scoped_statuses).
 *
 * Mirrors `list_statuses` but lives at the Space level so a status pipeline can
 * be defined once and shared by every list in the space whose `status_scope`
 * is 'space'. Backfilled losslessly from the space's existing list statuses.
 */
export const spaceStatuses = pgTable(
  'space_statuses',
  {
    id:        uuid('id').primaryKey().defaultRandom(),
    spaceId:   uuid('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
    key:       text('key').notNull(),
    name:      text('name').notNull(),
    color:     text('color').notNull().default('#94a3b8'),
    category:  text('category').$type<StatusCategory>().notNull().default('open'),
    position:  integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_space_statuses_space_key').on(t.spaceId, t.key),
    index('idx_space_statuses_space_position').on(t.spaceId, t.position),
  ],
)

export const spaceStatusesRelations = relations(spaceStatuses, ({ one }) => ({
  space: one(spaces, { fields: [spaceStatuses.spaceId], references: [spaces.id] }),
}))
