"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.spaceStatusesRelations = exports.spaceStatuses = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const spaces_1 = require("./spaces");
/**
 * Space-scoped status template (see 0036_scoped_statuses).
 *
 * Mirrors `list_statuses` but lives at the Space level so a status pipeline can
 * be defined once and shared by every list in the space whose `status_scope`
 * is 'space'. Backfilled losslessly from the space's existing list statuses.
 */
exports.spaceStatuses = (0, pg_core_1.pgTable)('space_statuses', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    spaceId: (0, pg_core_1.uuid)('space_id').notNull().references(() => spaces_1.spaces.id, { onDelete: 'cascade' }),
    key: (0, pg_core_1.text)('key').notNull(),
    name: (0, pg_core_1.text)('name').notNull(),
    color: (0, pg_core_1.text)('color').notNull().default('#94a3b8'),
    category: (0, pg_core_1.text)('category').$type().notNull().default('open'),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_space_statuses_space_key').on(t.spaceId, t.key),
    (0, pg_core_1.index)('idx_space_statuses_space_position').on(t.spaceId, t.position),
]);
exports.spaceStatusesRelations = (0, drizzle_orm_1.relations)(exports.spaceStatuses, ({ one }) => ({
    space: one(spaces_1.spaces, { fields: [exports.spaceStatuses.spaceId], references: [spaces_1.spaces.id] }),
}));
//# sourceMappingURL=space-statuses.js.map