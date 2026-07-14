import { pgTable, uuid, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { spaces } from './spaces'
import { users } from './users'
import { containerRoleEnum } from './enums'

/**
 * Explicit membership of a Space. Only load-bearing when a space's visibility
 * is 'private' — a public space is readable by any workspace member. The space
 * creator is seeded as an 'admin' member (migration 0035) so a later
 * private-conversion never orphans the container.
 */
export const spaceMembers = pgTable(
  'space_members',
  {
    id:        uuid('id').primaryKey().defaultRandom(),
    spaceId:   uuid('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
    userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role:      containerRoleEnum('role').notNull().default('edit'),
    addedById: uuid('added_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_space_members_space_user').on(t.spaceId, t.userId),
    index('idx_space_members_space').on(t.spaceId),
    index('idx_space_members_user').on(t.userId),
  ],
)

export const spaceMembersRelations = relations(spaceMembers, ({ one }) => ({
  space: one(spaces, { fields: [spaceMembers.spaceId], references: [spaces.id] }),
  user:  one(users,  { fields: [spaceMembers.userId],  references: [users.id] }),
}))
