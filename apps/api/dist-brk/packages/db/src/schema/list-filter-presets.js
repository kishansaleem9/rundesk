"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listFilterPresetsRelations = exports.listFilterPresets = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const lists_1 = require("./lists");
const users_1 = require("./users");
/**
 * §V2-07 "Saved filters" — frame `11:41`, top-right of the Filters panel.
 *
 * A named set of filter rules on one list, re-appliable in a click. Distinct
 * from a saved VIEW, which also remembers the layout (which view type, which
 * columns, how it is grouped and sorted): a saved filter is only the question
 * "which tasks", which is why it can be applied on top of whatever view you
 * happen to be in.
 *
 * PER USER, deliberately, matching `saved_searches` — the app's existing
 * answer to "a filter set I saved". A shared one would mean a teammate can
 * delete the filter you use every morning, and nothing in the video says these
 * are shared.
 *
 * Its own table rather than a `list_id` on `saved_searches`: that column would
 * have to be nullable to leave the command palette's presets alone, and a
 * nullable column inside the unique key that palette upserts on is a real
 * behaviour change (Postgres treats NULLs as distinct) for no gain.
 */
exports.listFilterPresets = (0, pg_core_1.pgTable)('list_filter_presets', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    listId: (0, pg_core_1.uuid)('list_id').notNull().references(() => lists_1.lists.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    /** The filter tree: `FilterNode[]`, leaves and one level of groups. */
    rules: (0, pg_core_1.jsonb)('rules').$type().notNull().default([]),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    // Saving under a name you already used replaces it, which is what "save"
    // means to the person doing it.
    (0, pg_core_1.unique)('uq_list_filter_presets_name').on(t.listId, t.userId, t.name),
    (0, pg_core_1.index)('idx_list_filter_presets_list_user').on(t.listId, t.userId),
]);
exports.listFilterPresetsRelations = (0, drizzle_orm_1.relations)(exports.listFilterPresets, ({ one }) => ({
    list: one(lists_1.lists, { fields: [exports.listFilterPresets.listId], references: [lists_1.lists.id] }),
    user: one(users_1.users, { fields: [exports.listFilterPresets.userId], references: [users_1.users.id] }),
}));
//# sourceMappingURL=list-filter-presets.js.map