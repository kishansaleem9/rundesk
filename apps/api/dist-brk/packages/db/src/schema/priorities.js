"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userPrioritiesRelations = exports.userPriorities = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
const tasks_1 = require("./tasks");
/**
 * §G06 [05:54] — "meri PRIORITIES kya hain — yaani ke aaj ke din mein mere
 * kaun se important task hain jo karne hain."
 *
 * The one thing on that profile panel that is a *decision* rather than a
 * derived list. Everything else there — assigned to me, today and overdue,
 * recent activity — is the app telling you what it already knows. This is the
 * person saying "out of all of that, these are the ones that matter today",
 * and nothing in the product could hold that answer.
 *
 * Favourites are the nearest existing thing and are not it: a favourite pins a
 * task into the sidebar rail permanently. That is a bookmark. This is a short,
 * ordered, disposable list you rewrite most mornings.
 *
 * Two kinds of row on purpose. A priority can point at a task you already have
 * — which keeps it live, so its title and status follow the task — or it can be
 * a line you typed, because "call the accountant" is a real priority that does
 * not deserve a task with a list and a status behind it. Requiring a task
 * first would make the fast case slow, which is how a daily list stops being
 * used by the second week.
 *
 * Deliberately NOT cleared at midnight. "Today's" describes what it is for,
 * not a retention policy — and a list that empties itself overnight loses work
 * somebody did on purpose. Ticking things off is how it clears.
 */
exports.userPriorities = (0, pg_core_1.pgTable)('user_priorities', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    /** The task this points at, when it points at one. */
    taskId: (0, pg_core_1.uuid)('task_id').references(() => tasks_1.tasks.id, { onDelete: 'cascade' }),
    /** The typed line, when it is not a task. */
    title: (0, pg_core_1.text)('title'),
    /** Hand-ordered: the point of the list is which one is first. */
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    /** Ticked off. Kept rather than deleted so "I did that today" survives. */
    doneAt: (0, pg_core_1.timestamp)('done_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    // The read: "my priorities in this workspace, in my order".
    byOwner: (0, pg_core_1.index)('user_priorities_owner_idx').on(t.userId, t.workspaceId, t.position),
    /*
     * The same task cannot be a priority twice.
     *
     * Partial, so it constrains only the rows that point at a task — typed
     * lines are free to repeat, because "chase the invoice" twice in a week is
     * a person doing it twice, not a duplicate.
     */
    uniqTask: (0, pg_core_1.uniqueIndex)('user_priorities_unique_task')
        .on(t.userId, t.workspaceId, t.taskId)
        .where((0, drizzle_orm_1.sql) `${t.taskId} is not null`),
    // A priority is a task or a line — never neither.
    hasSubject: (0, pg_core_1.check)('user_priorities_has_subject', (0, drizzle_orm_1.sql) `${t.taskId} is not null or ${t.title} is not null`),
}));
exports.userPrioritiesRelations = (0, drizzle_orm_1.relations)(exports.userPriorities, ({ one }) => ({
    user: one(users_1.users, { fields: [exports.userPriorities.userId], references: [users_1.users.id] }),
    workspace: one(workspaces_1.workspaces, { fields: [exports.userPriorities.workspaceId], references: [workspaces_1.workspaces.id] }),
    task: one(tasks_1.tasks, { fields: [exports.userPriorities.taskId], references: [tasks_1.tasks.id] }),
}));
//# sourceMappingURL=priorities.js.map