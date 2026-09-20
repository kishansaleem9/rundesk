"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.spaceMembersRelations = exports.spaceMembers = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const spaces_1 = require("./spaces");
const users_1 = require("./users");
const enums_1 = require("./enums");
/**
 * Explicit membership of a Space. Only load-bearing when a space's visibility
 * is 'private' — a public space is readable by any workspace member. The space
 * creator is seeded as an 'admin' member (migration 0035) so a later
 * private-conversion never orphans the container.
 */
exports.spaceMembers = (0, pg_core_1.pgTable)('space_members', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    spaceId: (0, pg_core_1.uuid)('space_id').notNull().references(() => spaces_1.spaces.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    role: (0, enums_1.containerRoleEnum)('role').notNull().default('edit'),
    addedById: (0, pg_core_1.uuid)('added_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_space_members_space_user').on(t.spaceId, t.userId),
    (0, pg_core_1.index)('idx_space_members_space').on(t.spaceId),
    (0, pg_core_1.index)('idx_space_members_user').on(t.userId),
]);
exports.spaceMembersRelations = (0, drizzle_orm_1.relations)(exports.spaceMembers, ({ one }) => ({
    space: one(spaces_1.spaces, { fields: [exports.spaceMembers.spaceId], references: [spaces_1.spaces.id] }),
    user: one(users_1.users, { fields: [exports.spaceMembers.userId], references: [users_1.users.id] }),
}));
//# sourceMappingURL=space-members.js.map