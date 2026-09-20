"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskDocLinksRelations = exports.taskDocLinks = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const tasks_1 = require("./tasks");
const docs_1 = require("./docs");
const users_1 = require("./users");
/**
 * Links a Doc to a Task (Plan §4 relationships). Complements task↔task
 * dependencies: a task can reference the docs that describe or support it. Both
 * sides must live in the same workspace (enforced in the service). Unique per
 * (task, doc).
 */
exports.taskDocLinks = (0, pg_core_1.pgTable)('task_doc_links', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    taskId: (0, pg_core_1.uuid)('task_id').notNull().references(() => tasks_1.tasks.id, { onDelete: 'cascade' }),
    docId: (0, pg_core_1.uuid)('doc_id').notNull().references(() => docs_1.docs.id, { onDelete: 'cascade' }),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    uniq: (0, pg_core_1.uniqueIndex)('task_doc_links_unique').on(t.taskId, t.docId),
    byTask: (0, pg_core_1.index)('task_doc_links_task_idx').on(t.taskId),
    byDoc: (0, pg_core_1.index)('task_doc_links_doc_idx').on(t.docId),
}));
exports.taskDocLinksRelations = (0, drizzle_orm_1.relations)(exports.taskDocLinks, ({ one }) => ({
    task: one(tasks_1.tasks, { fields: [exports.taskDocLinks.taskId], references: [tasks_1.tasks.id] }),
    doc: one(docs_1.docs, { fields: [exports.taskDocLinks.docId], references: [docs_1.docs.id] }),
}));
//# sourceMappingURL=task-doc-links.js.map