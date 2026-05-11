import { pgTable, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { announcements } from './announcements'
import { users } from './users'

export const announcementDismissals = pgTable(
  'announcement_dismissals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueAnnouncementDismissalPerUser: uniqueIndex('announcement_dismissals_unique_announcement_user').on(
      table.announcementId,
      table.userId,
    ),
  }),
)

export const announcementDismissalsRelations = relations(announcementDismissals, ({ one }) => ({
  announcement: one(announcements, {
    fields: [announcementDismissals.announcementId],
    references: [announcements.id],
  }),
  user: one(users, {
    fields: [announcementDismissals.userId],
    references: [users.id],
  }),
}))
