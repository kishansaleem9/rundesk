"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskTimeBlocksRelations = exports.taskTimeBlocks = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
const tasks_1 = require("./tasks");
/**
 * §V2-02 — the Planner's time blocks.
 *
 * `[14:52]` "Yahan pe jo mujhe task add hote hain, main un ko bhi apne planner
 * mein add kar sakti hoon DRAG AND DROP se", and `[14:56]` "to yeh meri planner
 * pe bhi show honge — yaani ke Google Calendar pe aur yahan pe bhi." Frame
 * `13:08` is the grid they land on: a week, an all-day row, an hour gutter and
 * a red now-line.
 *
 * `grep -ri "time.block\|time_block"` across `apps/` and `packages/` returned
 * zero files before this. Rundesk's calendar was a list VIEW TYPE and a
 * read-only strip on the person panel; there was nowhere for "I will do this
 * task from 2 to 4 on Thursday" to be recorded.
 *
 * A BLOCK IS NOT A TASK, AND NOT A DUE DATE.
 *
 * A due date says when something must be finished. A block says when you
 * intend to work on it, and there can be several for one task — an hour on
 * Tuesday and two more on Thursday is the normal shape of real work. That is
 * why this is its own table rather than columns on `tasks`: the moment you
 * allow two, a column cannot hold it.
 *
 * `taskId` is nullable for the same reason `user_priorities.taskId` is: a block
 * can be "lunch" or "school run", and requiring a task first would make the
 * fast case slow. `title` carries those; a task-backed block leaves it null and
 * renders from the task, so renaming the task renames the block.
 */
exports.taskTimeBlocks = (0, pg_core_1.pgTable)('task_time_blocks', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    /** Whose planner this block is on. Blocks are personal, like priorities. */
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    /** The task being worked on, when the block is about one. */
    taskId: (0, pg_core_1.uuid)('task_id').references(() => tasks_1.tasks.id, { onDelete: 'cascade' }),
    /** The typed label, when the block is not about a task. */
    title: (0, pg_core_1.text)('title'),
    startsAt: (0, pg_core_1.timestamp)('starts_at', { withTimezone: true }).notNull(),
    endsAt: (0, pg_core_1.timestamp)('ends_at', { withTimezone: true }).notNull(),
    /** Frame `13:08`'s "All day" row, which sits above the hour gutter. */
    isAllDay: (0, pg_core_1.boolean)('is_all_day').notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    // The read the grid makes: "my blocks in this workspace, in this week".
    (0, pg_core_1.index)('idx_task_time_blocks_owner_span').on(t.userId, t.workspaceId, t.startsAt),
    // The read the task detail makes: "when am I doing this one".
    (0, pg_core_1.index)('idx_task_time_blocks_task').on(t.taskId),
    // A block is about a task or carries a label — never neither, or the grid
    // draws a rectangle with nothing in it and no way to find out what it was.
    (0, pg_core_1.check)('task_time_blocks_has_subject', (0, drizzle_orm_1.sql) `${t.taskId} is not null or ${t.title} is not null`),
    // Zero-length and backwards blocks are not a thing a calendar can draw.
    (0, pg_core_1.check)('task_time_blocks_ends_after_starts', (0, drizzle_orm_1.sql) `${t.endsAt} > ${t.startsAt}`),
]);
exports.taskTimeBlocksRelations = (0, drizzle_orm_1.relations)(exports.taskTimeBlocks, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.taskTimeBlocks.workspaceId], references: [workspaces_1.workspaces.id] }),
    user: one(users_1.users, { fields: [exports.taskTimeBlocks.userId], references: [users_1.users.id] }),
    task: one(tasks_1.tasks, { fields: [exports.taskTimeBlocks.taskId], references: [tasks_1.tasks.id] }),
}));
//# sourceMappingURL=time-blocks.js.map