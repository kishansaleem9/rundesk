import { pgTable, text, timestamp, uuid, integer, boolean } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tasks } from './tasks'
import { users } from './users'
import { clickupImportJobs } from './clickup-import-jobs'

export const timeEntries = pgTable('time_entries', {
  id:          uuid('id').primaryKey().defaultRandom(),
  taskId:      uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  startedAt:   timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt:     timestamp('ended_at', { withTimezone: true }),
  durationSec: integer('duration_sec'), // null while timer is running; set on stop or on manual create
  description: text('description'),
  isBillable:  boolean('is_billable').notNull().default(false),
  // §12.10 — set once this entry's billable time has been rolled into a client
  // invoice, so it is never double-invoiced. Plain column; the FK to
  // client_invoices is added in the migration to avoid a schema import cycle.
  clientInvoiceId: uuid('client_invoice_id'),
  // Which import made this row (Settings › Imports / Exports); null for everything else.
  importId: uuid('import_id').references(() => clickupImportJobs.id, { onDelete: 'set null' }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  task: one(tasks, { fields: [timeEntries.taskId], references: [tasks.id] }),
  user: one(users, { fields: [timeEntries.userId], references: [users.id] }),
}))
