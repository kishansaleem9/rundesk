import { pgTable, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { announcements } from './announcements'
import { users } from './users'

/**
 * WHO HAS SEEN AN ANNOUNCEMENT: one row per person, so its view count is the
 * people shown it, not the calls made (`found-28-sep/announcement-views-counted-per-click`).
 */
export const announcementViews = pgTable(
  'announcement_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueAnnouncementViewPerUser: uniqueIndex('announcement_views_unique_announcement_user').on(
      table.announcementId,
      table.userId,
    ),
  }),
)

export const announcementViewsRelations = relations(announcementViews, ({ one }) => ({
  announcement: one(announcements, {
    fields: [announcementViews.announcementId],
    references: [announcements.id],
  }),
  user: one(users, {
    fields: [announcementViews.userId],
    references: [users.id],
  }),
}))
