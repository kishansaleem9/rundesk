"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.foldersRelations = exports.folders = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const spaces_1 = require("./spaces");
const projects_1 = require("./projects");
const users_1 = require("./users");
const enums_1 = require("./enums");
/**
 * A Folder groups multiple projects inside a Space — the plan's Level-4
 * container (Org > Workspace > Space > Folder > Project). `projects.folderId`
 * is nullable: a null folder means the project sits directly under the space
 * ("ungrouped"), so folders are purely optional organisation.
 */
exports.folders = (0, pg_core_1.pgTable)('folders', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    spaceId: (0, pg_core_1.uuid)('space_id').notNull().references(() => spaces_1.spaces.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    color: (0, pg_core_1.text)('color').default('#354fb0'),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    isArchived: (0, pg_core_1.boolean)('is_archived').notNull().default(false),
    // §13.4 Trash — when the item was deleted and by whom (null = unknown/legacy).
    archivedAt: (0, pg_core_1.timestamp)('archived_at', { withTimezone: true }),
    archivedById: (0, pg_core_1.uuid)('archived_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    // §2 per-item privacy: a 'private' folder is visible only to its creator and
    // workspace managers/admins (enforced on every read path).
    visibility: (0, enums_1.containerVisibilityEnum)('visibility').notNull().default('public'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [(0, pg_core_1.index)('idx_folders_space').on(t.spaceId, t.position)]);
exports.foldersRelations = (0, drizzle_orm_1.relations)(exports.folders, ({ one, many }) => ({
    space: one(spaces_1.spaces, { fields: [exports.folders.spaceId], references: [spaces_1.spaces.id] }),
    projects: many(projects_1.projects),
}));
//# sourceMappingURL=folders.js.map