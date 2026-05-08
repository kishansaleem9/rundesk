import { pgTable, text, timestamp, uuid, unique, index } from 'drizzle-orm/pg-core'
import { users } from './users'

export const webPushSubscriptions = pgTable(
  'web_push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueUserEndpoint: unique('uq_web_push_user_endpoint').on(t.userId, t.endpoint),
    uniqueEndpoint: unique('uq_web_push_endpoint').on(t.endpoint),
    userIdx: index('idx_web_push_subscriptions_user').on(t.userId),
  }),
)
