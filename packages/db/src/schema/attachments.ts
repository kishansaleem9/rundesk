import { pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tasks } from './tasks'
import { users } from './users'
import { taskComments } from './comments'

// Attachments live in R2 (S3-compatible). The DB holds the object key + metadata.
// `storageKey` is the R2 object key; actual URLs are generated via presigned links at read time.
export const taskAttachments = pgTable('task_attachments', {
  id:          uuid('id').primaryKey().defaultRandom(),
  taskId:      uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  // When set, the file was attached to a specific comment (Plan §4). It still
  // belongs to the task; on comment deletion the file stays and this clears.
  commentId:   uuid('comment_id').references(() => taskComments.id, { onDelete: 'set null' }),
  uploadedById: uuid('uploaded_by_id').references(() => users.id, { onDelete: 'set null' }),
  fileName:    text('file_name').notNull(),
  contentType: text('content_type').notNull(),
  sizeBytes:   integer('size_bytes').notNull(),
  storageKey:  text('storage_key').notNull(),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const taskAttachmentsRelations = relations(taskAttachments, ({ one }) => ({
  task:       one(tasks, { fields: [taskAttachments.taskId], references: [tasks.id] }),
  comment:    one(taskComments, { fields: [taskAttachments.commentId], references: [taskComments.id] }),
  uploadedBy: one(users, { fields: [taskAttachments.uploadedById], references: [users.id] }),
}))
