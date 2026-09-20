"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskAssigneesRelations = exports.tasksRelations = exports.taskAssignees = exports.tasks = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const lists_1 = require("./lists");
const users_1 = require("./users");
const enums_1 = require("./enums");
const task_types_1 = require("./task-types");
exports.tasks = (0, pg_core_1.pgTable)('tasks', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    listId: (0, pg_core_1.uuid)('list_id').notNull().references(() => lists_1.lists.id, { onDelete: 'cascade' }),
    parentTaskId: (0, pg_core_1.uuid)('parent_task_id').references(() => exports.tasks.id, { onDelete: 'cascade' }),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    title: (0, pg_core_1.text)('title').notNull(),
    description: (0, pg_core_1.text)('description'),
    priority: (0, enums_1.taskPriorityEnum)('priority').notNull().default('normal'),
    // `status` was a pgEnum (task_status) but is now a free-text key that must
    // match one of the list's `list_statuses.key` rows. The original 6 enum
    // values still work as defaults for back-compat.
    status: (0, pg_core_1.text)('status').notNull().default('todo'),
    // Derived bucket from the list status, denormalised onto the task so we
    // don't need to join list_statuses on every query.
    statusCategory: (0, pg_core_1.text)('status_category').$type().notNull().default('open'),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    startDate: (0, pg_core_1.timestamp)('start_date', { withTimezone: true }),
    dueDate: (0, pg_core_1.timestamp)('due_date', { withTimezone: true }),
    completedAt: (0, pg_core_1.timestamp)('completed_at', { withTimezone: true }),
    timeEstimate: (0, pg_core_1.integer)('time_estimate'), // seconds
    /*
     * §V2-09 — the banner across the top of the task detail.
     *
     * Frame `03:10` shows the picker: Gallery | Upload | Link | Search |
     * Attachments, with Remove, and the banner then offering Reposition and
     * Change cover. Two of those set a COLOUR and three set an IMAGE, so the two
     * are stored separately rather than one field holding either — whichever was
     * set last wins, and clearing one does not disturb the other.
     *
     * A CSS color/gradient string (the Gallery tab).
     */
    coverColor: (0, pg_core_1.text)('cover_color'),
    /*
     * An image the workspace uploaded, or one already attached to the task. Held
     * as a STORAGE KEY and presigned on read, never as a URL.
     *
     * Deliberately not one column shared with `coverImageUrl` below. Task
     * attachments already made that mistake — a hyperlink attachment is written
     * into `storage_key` and then read back through `r2.getObjectUrl`, which
     * either prefixes the CDN host onto `https://…` or presigns a bucket key
     * named after somebody's URL. Both are dead links. Keeping the two apart is
     * what stops this repeating it.
     */
    coverStorageKey: (0, pg_core_1.text)('cover_storage_key'),
    /** An image somewhere else on the web — the picker's Link tab. Used as-is. */
    coverImageUrl: (0, pg_core_1.text)('cover_image_url'),
    /*
     * Reposition: how far down the image to sit in the banner, 0–100, as a
     * percentage for `object-position`. 50 is centred, which is what an image
     * gets before anybody drags it.
     */
    coverOffsetY: (0, pg_core_1.integer)('cover_offset_y').notNull().default(50),
    // Milestone marker (Plan §5 timeline): a key deliverable, rendered as a
    // diamond on the timeline and badged in lists.
    isMilestone: (0, pg_core_1.boolean)('is_milestone').notNull().default(false),
    // What this task *is* (Task / Campaign / Invoice …). Nullable: untyped is a
    // valid state, and deleting a type SET NULLs this rather than the task.
    taskTypeId: (0, pg_core_1.uuid)('task_type_id').references(() => task_types_1.taskTypes.id, { onDelete: 'set null' }),
    // Persisted recurrence config. When set and the task is completed, the next
    // occurrence is auto-created and the config moves forward to it (0038).
    recurrence: (0, pg_core_1.jsonb)('recurrence').$type(),
    /**
     * "Not live." Set by BOTH archiving and deleting, because every read path in
     * the product (lists, search, reports, planner, AI) hides a task on this one
     * flag and a delete that left it false would leave the task on screen.
     * Which of the two it was is `deletedAt`, below.
     */
    isArchived: (0, pg_core_1.boolean)('is_archived').notNull().default(false),
    // §13.4 Trash — when the item was ARCHIVED and by whom (null = unknown/legacy).
    archivedAt: (0, pg_core_1.timestamp)('archived_at', { withTimezone: true }),
    archivedById: (0, pg_core_1.uuid)('archived_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    /**
     * §V2-08 frame `15:32` — the task menu draws **Archive** and **Delete** as two
     * rows, and until now Rundesk had one soft archive wearing both names.
     *
     * These two columns are what makes them different things:
     *
     *   archive → isArchived=true, archivedAt set, deletedAt NULL
     *             · listed under GET /workspaces/:id/archived-tasks
     *             · restored by POST /tasks/:id/restore
     *             · kept for good — the retention purge never sees it
     *   delete  → isArchived=true, deletedAt + deletedById set
     *             · listed in the workspace Trash beside spaces/lists/docs
     *             · restored by POST /workspaces/:id/trash/task/:id/restore
     *             · hard-deleted by the same nightly purge after
     *               TRASH_RETENTION_DAYS, or at once via "Delete forever"
     *
     * `deletedAt` is the ONLY thing the Trash selects tasks on, so an archived
     * task can never appear there and can never be purged.
     */
    deletedAt: (0, pg_core_1.timestamp)('deleted_at', { withTimezone: true }),
    deletedById: (0, pg_core_1.uuid)('deleted_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    // §2 per-item privacy: a 'private' task is visible only to its creator, its
    // assignees, and workspace managers/admins (enforced on every read path).
    visibility: (0, enums_1.containerVisibilityEnum)('visibility').notNull().default('public'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.index)('idx_tasks_list_status').on(t.listId, t.status),
    (0, pg_core_1.index)('tasks_task_type_idx').on(t.taskTypeId),
    // The Trash lists binned tasks newest-first and the nightly purge scans by
    // age; both read this column and nothing else.
    (0, pg_core_1.index)('idx_tasks_deleted_at').on(t.deletedAt),
]);
exports.taskAssignees = (0, pg_core_1.pgTable)('task_assignees', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    taskId: (0, pg_core_1.uuid)('task_id').notNull().references(() => exports.tasks.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    assignedAt: (0, pg_core_1.timestamp)('assigned_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    // A user is assigned to a task at most once; makes addAssignee's
    // onConflictDoNothing actually dedupe (Plan §5 bulk-assign).
    taskUserUnique: (0, pg_core_1.uniqueIndex)('task_assignees_task_user_unique').on(t.taskId, t.userId),
}));
exports.tasksRelations = (0, drizzle_orm_1.relations)(exports.tasks, ({ one, many }) => ({
    list: one(lists_1.lists, { fields: [exports.tasks.listId], references: [lists_1.lists.id] }),
    parent: one(exports.tasks, { fields: [exports.tasks.parentTaskId], references: [exports.tasks.id], relationName: 'subtasks' }),
    subtasks: many(exports.tasks, { relationName: 'subtasks' }),
    creator: one(users_1.users, { fields: [exports.tasks.createdById], references: [users_1.users.id] }),
    assignees: many(exports.taskAssignees),
    // §1.1 — so a task read can carry what kind of task it is without a second
    // query per row. The type was settable and filterable but never displayed
    // anywhere a member scans work.
    taskType: one(task_types_1.taskTypes, { fields: [exports.tasks.taskTypeId], references: [task_types_1.taskTypes.id] }),
}));
exports.taskAssigneesRelations = (0, drizzle_orm_1.relations)(exports.taskAssignees, ({ one }) => ({
    task: one(exports.tasks, { fields: [exports.taskAssignees.taskId], references: [exports.tasks.id] }),
    user: one(users_1.users, { fields: [exports.taskAssignees.userId], references: [users_1.users.id] }),
}));
//# sourceMappingURL=tasks.js.map