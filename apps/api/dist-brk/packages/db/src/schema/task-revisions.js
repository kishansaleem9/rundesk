"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskDescriptionRevisionsRelations = exports.taskDescriptionRevisions = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const tasks_1 = require("./tasks");
const users_1 = require("./users");
/**
 * §V2-08 — "Description history", the item she names first.
 *
 * `[15:27]` "yahan par aap ko HISTORY wagera sab cheezein show hoti hain."
 *
 * WHY THIS STORES THE OLD TEXT, NOT THE NEW ONE — the one decision here worth
 * arguing about, because `doc_revisions` does the opposite.
 *
 * A doc is created empty and saved over and over, so snapshotting the text
 * AFTER each save captures its whole life. A task's description arrives already
 * written and is then edited rarely. Snapshotting the new text would mean the
 * description every existing task has RIGHT NOW is never recorded anywhere: the
 * first edit after this ships would overwrite it and the history would begin
 * with the text that replaced it. The thing somebody opens description history
 * to recover is exactly the thing that design throws away.
 *
 * So each row is "what it said until `replaced_at`", written at the moment the
 * text is replaced. The current description is not duplicated here — it is on
 * the task — and the first edit of any task, however old, preserves what was
 * there before.
 *
 * `description` is nullable because `tasks.description` is: a task whose
 * description is cleared has to be able to say "it used to be empty", and a
 * row that silently became `''` would make an emptying look like an edit that
 * never happened.
 */
exports.taskDescriptionRevisions = (0, pg_core_1.pgTable)('task_description_revisions', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    taskId: (0, pg_core_1.uuid)('task_id').notNull().references(() => tasks_1.tasks.id, { onDelete: 'cascade' }),
    // Set null rather than cascade: a person leaving must not delete the
    // history of what a task used to say.
    editorId: (0, pg_core_1.uuid)('editor_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    description: (0, pg_core_1.text)('description'),
    replacedAt: (0, pg_core_1.timestamp)('replaced_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    // The only read is "this task's revisions, newest first".
    byTask: (0, pg_core_1.index)('task_description_revisions_task_idx').on(t.taskId, t.replacedAt),
}));
exports.taskDescriptionRevisionsRelations = (0, drizzle_orm_1.relations)(exports.taskDescriptionRevisions, ({ one }) => ({
    task: one(tasks_1.tasks, { fields: [exports.taskDescriptionRevisions.taskId], references: [tasks_1.tasks.id] }),
    editor: one(users_1.users, { fields: [exports.taskDescriptionRevisions.editorId], references: [users_1.users.id] }),
}));
//# sourceMappingURL=task-revisions.js.map