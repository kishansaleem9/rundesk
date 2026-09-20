"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.announcementsRelations = exports.announcements = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
exports.announcements = (0, pg_core_1.pgTable)('announcements', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    title: (0, pg_core_1.text)('title').notNull(),
    body: (0, pg_core_1.text)('body').notNull().default(''),
    tone: (0, pg_core_1.text)('tone').notNull().default('info'),
    isActive: (0, pg_core_1.boolean)('is_active').notNull().default(true),
    expiresAt: (0, pg_core_1.timestamp)('expires_at', { withTimezone: true }),
    views: (0, pg_core_1.integer)('views').notNull().default(0),
    dismisses: (0, pg_core_1.integer)('dismisses').notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.announcementsRelations = (0, drizzle_orm_1.relations)(exports.announcements, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.announcements.workspaceId], references: [workspaces_1.workspaces.id] }),
    createdBy: one(users_1.users, { fields: [exports.announcements.createdById], references: [users_1.users.id] }),
}));
//# sourceMappingURL=announcements.js.map