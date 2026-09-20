"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listStatusesRelations = exports.listStatuses = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const lists_1 = require("./lists");
/**
 * Per-list custom status pipeline.
 *
 * Every list gets a default set of 6 statuses seeded at migration time
 * (Backlog, To do, In progress, In review, Done, Cancelled) so the
 * existing enum-based tasks keep working. Owners can rename, recolour,
 * reorder, add, or delete them via the list settings.
 *
 * `key` is the stable identifier persisted on `tasks.status` — renaming
 * the user-facing `name` does NOT migrate task rows. Deleting a status
 * is only allowed once all tasks have been reassigned to another status
 * (enforced in the service layer).
 *
 * `category` buckets the status into open / in_progress / closed so
 * reports, automations, and burndown charts can keep working even after
 * the user customises the pipeline.
 */
exports.listStatuses = (0, pg_core_1.pgTable)('list_statuses', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    listId: (0, pg_core_1.uuid)('list_id').notNull().references(() => lists_1.lists.id, { onDelete: 'cascade' }),
    key: (0, pg_core_1.text)('key').notNull(),
    name: (0, pg_core_1.text)('name').notNull(),
    color: (0, pg_core_1.text)('color').notNull().default('#94a3b8'),
    category: (0, pg_core_1.text)('category').$type().notNull().default('open'),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_list_statuses_list_key').on(t.listId, t.key),
    (0, pg_core_1.index)('idx_list_statuses_list_position').on(t.listId, t.position),
]);
exports.listStatusesRelations = (0, drizzle_orm_1.relations)(exports.listStatuses, ({ one }) => ({
    list: one(lists_1.lists, { fields: [exports.listStatuses.listId], references: [lists_1.lists.id] }),
}));
//# sourceMappingURL=list-statuses.js.map