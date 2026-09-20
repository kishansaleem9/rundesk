"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectsRelations = exports.projects = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const spaces_1 = require("./spaces");
const lists_1 = require("./lists");
const users_1 = require("./users");
const enums_1 = require("./enums");
exports.projects = (0, pg_core_1.pgTable)('projects', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    spaceId: (0, pg_core_1.uuid)('space_id').notNull().references(() => spaces_1.spaces.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    color: (0, pg_core_1.text)('color').default('#354fb0'),
    icon: (0, pg_core_1.text)('icon'),
    // Optional Level-4 grouping. Null = project sits directly under the space.
    // The FK to folders is declared in migration 0034 (kept out of the Drizzle
    // schema to avoid a folders<->projects import cycle).
    folderId: (0, pg_core_1.uuid)('folder_id'),
    // Optional client this project bills to (Plan §9). FK declared in migration
    // 0047 (kept out of Drizzle to avoid a projects<->clients import cycle).
    clientId: (0, pg_core_1.uuid)('client_id'),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    isArchived: (0, pg_core_1.boolean)('is_archived').notNull().default(false),
    // §13.4 Trash — when the item was deleted and by whom (null = unknown/legacy).
    archivedAt: (0, pg_core_1.timestamp)('archived_at', { withTimezone: true }),
    archivedById: (0, pg_core_1.uuid)('archived_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    visibility: (0, enums_1.containerVisibilityEnum)('visibility'),
    // Time logged on this project's tasks defaults to billable when true (§8.3).
    defaultBillable: (0, pg_core_1.boolean)('default_billable').notNull().default(false),
    /*
     * §G15-10 — the container behind "a List that lives in a Space".
     *
     * She creates a List by choosing a Space; ours needed a Project in between.
     * Rather than make `lists.project_id` nullable — which would strand a list
     * outside the 114 joins that reach its workspace through its project, the
     * resource guard included — the space keeps one hidden container and the list
     * goes in it. One per space (partial unique index, migration 0129), created
     * on demand, never listed and never offered as a destination.
     */
    isDefaultContainer: (0, pg_core_1.boolean)('is_default_container').notNull().default(false),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.projectsRelations = (0, drizzle_orm_1.relations)(exports.projects, ({ one, many }) => ({
    space: one(spaces_1.spaces, { fields: [exports.projects.spaceId], references: [spaces_1.spaces.id] }),
    lists: many(lists_1.lists),
}));
//# sourceMappingURL=projects.js.map