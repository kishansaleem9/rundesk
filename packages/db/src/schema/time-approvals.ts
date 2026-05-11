import { pgTable, text, timestamp, uuid, uniqueIndex, date } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

export const timeApprovals = pgTable(
  'time_approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    weekStart: date('week_start').notNull(),
    status: text('status').notNull().default('pending'),
    rejectionReason: text('rejection_reason'),
    approvedById: uuid('approved_by_id').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    workspaceUserWeekUnique: uniqueIndex('time_approvals_workspace_user_week_unique').on(
      table.workspaceId,
      table.userId,
      table.weekStart,
    ),
  }),
)

export const timeApprovalsRelations = relations(timeApprovals, ({ one }) => ({
  workspace: one(workspaces, { fields: [timeApprovals.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [timeApprovals.userId], references: [users.id] }),
  approvedBy: one(users, { fields: [timeApprovals.approvedById], references: [users.id] }),
}))
