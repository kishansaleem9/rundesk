import { pgTable, text, timestamp, uuid, boolean, jsonb, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users'
import { workspaces } from './workspaces'
import { notificationTypeEnum } from './enums'

export const notifications = pgTable('notifications', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  actorId:     uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  type:        notificationTypeEnum('type').notNull(),
  title:       text('title').notNull(),
  body:        text('body'),
  // Deep-link target: { entityType: 'task', entityId: '...', url: '/app/...' }
  target:      jsonb('target').$type<{ entityType: string; entityId: string; url?: string }>(),
  readAt:      timestamp('read_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('idx_notifications_user_unread').on(t.userId, t.readAt),
])

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user:      one(users,      { fields: [notifications.userId], references: [users.id] }),
  actor:     one(users,      { fields: [notifications.actorId], references: [users.id] }),
  workspace: one(workspaces, { fields: [notifications.workspaceId], references: [workspaces.id] }),
}))
