import { pgTable, text, timestamp, uuid, date, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

/**
 * §A4.10 Days off / time away. The useful slice of ClickUp's work-schedule
 * model: someone on leave should stop absorbing planned load in the workload
 * heat-map, so the plan reflects who is actually available.
 *
 * Both bounds are inclusive calendar `date`s — leave is a calendar concept, and
 * storing it as a timestamp would shift a person's last day by a timezone.
 */
export const timeOff = pgTable(
  'time_off',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    startsOn:    date('starts_on').notNull(),
    endsOn:      date('ends_on').notNull(),
    note:        text('note'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_time_off_workspace_range').on(t.workspaceId, t.startsOn, t.endsOn),
    index('idx_time_off_user').on(t.userId),
  ],
)

export const timeOffRelations = relations(timeOff, ({ one }) => ({
  workspace: one(workspaces, { fields: [timeOff.workspaceId], references: [workspaces.id] }),
  user:      one(users, { fields: [timeOff.userId], references: [users.id] }),
}))
