"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskAttachmentsRelations = exports.taskAttachments = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const tasks_1 = require("./tasks");
const users_1 = require("./users");
const comments_1 = require("./comments");
// Attachments live in R2 (S3-compatible). The DB holds the object key + metadata.
// `storageKey` is the R2 object key; actual URLs are generated via presigned links at read time.
exports.taskAttachments = (0, pg_core_1.pgTable)('task_attachments', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    taskId: (0, pg_core_1.uuid)('task_id').notNull().references(() => tasks_1.tasks.id, { onDelete: 'cascade' }),
    // When set, the file was attached to a specific comment (Plan §4). It still
    // belongs to the task; on comment deletion the file stays and this clears.
    commentId: (0, pg_core_1.uuid)('comment_id').references(() => comments_1.taskComments.id, { onDelete: 'set null' }),
    uploadedById: (0, pg_core_1.uuid)('uploaded_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    fileName: (0, pg_core_1.text)('file_name').notNull(),
    contentType: (0, pg_core_1.text)('content_type').notNull(),
    sizeBytes: (0, pg_core_1.integer)('size_bytes').notNull(),
    storageKey: (0, pg_core_1.text)('storage_key').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.taskAttachmentsRelations = (0, drizzle_orm_1.relations)(exports.taskAttachments, ({ one }) => ({
    task: one(tasks_1.tasks, { fields: [exports.taskAttachments.taskId], references: [tasks_1.tasks.id] }),
    comment: one(comments_1.taskComments, { fields: [exports.taskAttachments.commentId], references: [comments_1.taskComments.id] }),
    uploadedBy: one(users_1.users, { fields: [exports.taskAttachments.uploadedById], references: [users_1.users.id] }),
}));
//# sourceMappingURL=attachments.js.map