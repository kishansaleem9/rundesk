import { pgTable, text, integer, timestamp, uuid, jsonb, index } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

/**
 * A saved custom report definition (metrics × dimension × filters + viz).
 * The definition is interpreted by ReportsService.runCustomReport at query time.
 *
 * §9.5 scheduled delivery: `schedule_frequency` ('none' | 'daily' | 'weekly')
 * plus a send hour (0–23 UTC) and, for weekly, a weekday (0=Sun … 6=Sat) drive
 * the hourly ScheduledReportsService cron. `schedule_recipients` is a jsonb array
 * of email addresses (empty ⇒ falls back to the report owner). `last_sent_at`
 * gates re-sends so a report is emailed at most once per period.
 */
export const customReports = pgTable(
  'custom_reports',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    name:        text('name').notNull(),
    definition:  jsonb('definition').$type<Record<string, unknown>>().notNull().default({}),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    scheduleFrequency:  text('schedule_frequency').$type<'none' | 'daily' | 'weekly'>().notNull().default('none'),
    scheduleHour:       integer('schedule_hour').notNull().default(8),
    scheduleDayOfWeek:  integer('schedule_day_of_week'),
    scheduleRecipients: jsonb('schedule_recipients').$type<string[]>().notNull().default([]),
    lastSentAt:         timestamp('last_sent_at', { withTimezone: true }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index('idx_custom_reports_workspace').on(t.workspaceId),
    bySchedule:  index('idx_custom_reports_scheduled').on(t.scheduleFrequency).where(sql`${t.scheduleFrequency} <> 'none'`),
  }),
)

export const customReportsRelations = relations(customReports, ({ one }) => ({
  workspace: one(workspaces, { fields: [customReports.workspaceId], references: [workspaces.id] }),
  createdBy: one(users, { fields: [customReports.createdById], references: [users.id] }),
}))
