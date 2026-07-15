import { pgTable, timestamp, uuid, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tasks } from './tasks'
import { docs } from './docs'
import { users } from './users'

/**
 * Links a Doc to a Task (Plan §4 relationships). Complements task↔task
 * dependencies: a task can reference the docs that describe or support it. Both
 * sides must live in the same workspace (enforced in the service). Unique per
 * (task, doc).
 */
export const taskDocLinks = pgTable(
  'task_doc_links',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    taskId:      uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    docId:       uuid('doc_id').notNull().references(() => docs.id, { onDelete: 'cascade' }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq:   uniqueIndex('task_doc_links_unique').on(t.taskId, t.docId),
    byTask: index('task_doc_links_task_idx').on(t.taskId),
    byDoc:  index('task_doc_links_doc_idx').on(t.docId),
  }),
)

export const taskDocLinksRelations = relations(taskDocLinks, ({ one }) => ({
  task: one(tasks, { fields: [taskDocLinks.taskId], references: [tasks.id] }),
  doc:  one(docs,  { fields: [taskDocLinks.docId],  references: [docs.id] }),
}))
