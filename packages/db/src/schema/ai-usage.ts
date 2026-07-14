import { pgTable, text, timestamp, uuid, integer, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

/**
 * One row per Claude API call (Plan §7.15). Token counts drive per-user and
 * per-workspace usage + estimated-cost reporting. workspace_id/user_id are
 * nullable (SET NULL on delete) so historical usage survives member removal.
 */
export const aiUsage = pgTable(
  'ai_usage',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    workspaceId:  uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    userId:       uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    feature:      text('feature').notNull(),
    model:        text('model').notNull(),
    inputTokens:  integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_ai_usage_workspace_created').on(t.workspaceId, t.createdAt),
    index('idx_ai_usage_user').on(t.userId),
  ],
)

export const aiUsageRelations = relations(aiUsage, ({ one }) => ({
  workspace: one(workspaces, { fields: [aiUsage.workspaceId], references: [workspaces.id] }),
  user:      one(users, { fields: [aiUsage.userId], references: [users.id] }),
}))
