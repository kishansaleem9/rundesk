import { pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tasks } from './tasks'
import { users } from './users'

// Attachments live in R2 (S3-compatible). The DB holds the object key + metadata.
// `storageKey` is the R2 object key; actual URLs are generated via presigned links at read time.
export const taskAttachments = pgTable('task_attachments', {
  id:          uuid('id').primaryKey().defaultRandom(),
  taskId:      uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  uploadedById: uuid('uploaded_by_id').references(() => users.id, { onDelete: 'set null' }),
  fileName:    text('file_name').notNull(),
  contentType: text('content_type').notNull(),
  sizeBytes:   integer('size_bytes').notNull(),
  storageKey:  text('storage_key').notNull(),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const taskAttachmentsRelations = relations(taskAttachments, ({ one }) => ({
  task:       one(tasks, { fields: [taskAttachments.taskId], references: [tasks.id] }),
  uploadedBy: one(users, { fields: [taskAttachments.uploadedById], references: [users.id] }),
}))
