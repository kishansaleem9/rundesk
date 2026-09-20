"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskViewPrefsRelations = exports.taskViewsRelations = exports.taskViewPrefs = exports.taskViews = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const lists_1 = require("./lists");
const users_1 = require("./users");
const enums_1 = require("./enums");
// A saved view on a list (ClickUp-style "List view", "Board view", etc.)
// config holds type-specific settings: { groupBy?, sortBy?, filters?, hiddenFields? }
exports.taskViews = (0, pg_core_1.pgTable)('task_views', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    listId: (0, pg_core_1.uuid)('list_id').notNull().references(() => lists_1.lists.id, { onDelete: 'cascade' }),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    name: (0, pg_core_1.text)('name').notNull(),
    type: (0, enums_1.viewTypeEnum)('type').notNull(),
    isDefault: (0, pg_core_1.boolean)('is_default').notNull().default(false),
    /** §V2-07 "Pin view" — pinned views sort ahead of the rest in the tab strip. */
    isPinned: (0, pg_core_1.boolean)('is_pinned').notNull().default(false),
    visibility: (0, pg_core_1.text)('visibility').$type().notNull().default('everyone'),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    config: (0, pg_core_1.jsonb)('config').$type().notNull().default({}),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
/**
 * §V2-07 "Autosave for me" — the one switch in that panel that is explicitly
 * per-user, and the frame says so in its own tooltip:
 *
 *   "Autosave will automatically save any layout changes you make to this
 *    view. Each user turns this on independently, but changes saved by
 *    Autosave will be seen by everyone."
 *
 * So the FLAG is per user and the SAVE is shared — which is exactly why it
 * cannot be a column on `task_views` (that would make one person's preference
 * everyone's) and cannot be browser storage either (the flag has to survive a
 * new laptop, and it is a real preference, not a remembered scroll position).
 */
exports.taskViewPrefs = (0, pg_core_1.pgTable)('task_view_prefs', {
    viewId: (0, pg_core_1.uuid)('view_id').notNull().references(() => exports.taskViews.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    autosave: (0, pg_core_1.boolean)('autosave').notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.primaryKey)({ columns: [t.viewId, t.userId] }),
    (0, pg_core_1.index)('idx_task_view_prefs_user').on(t.userId),
]);
exports.taskViewsRelations = (0, drizzle_orm_1.relations)(exports.taskViews, ({ one, many }) => ({
    list: one(lists_1.lists, { fields: [exports.taskViews.listId], references: [lists_1.lists.id] }),
    creator: one(users_1.users, { fields: [exports.taskViews.createdById], references: [users_1.users.id] }),
    prefs: many(exports.taskViewPrefs),
}));
exports.taskViewPrefsRelations = (0, drizzle_orm_1.relations)(exports.taskViewPrefs, ({ one }) => ({
    view: one(exports.taskViews, { fields: [exports.taskViewPrefs.viewId], references: [exports.taskViews.id] }),
    user: one(users_1.users, { fields: [exports.taskViewPrefs.userId], references: [users_1.users.id] }),
}));
//# sourceMappingURL=views.js.map