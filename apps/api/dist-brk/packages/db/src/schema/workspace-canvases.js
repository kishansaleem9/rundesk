"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspaceCanvasesRelations = exports.workspaceCanvases = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
exports.workspaceCanvases = (0, pg_core_1.pgTable)('workspace_canvases', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id')
        .notNull()
        .references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    type: (0, pg_core_1.text)('type').notNull(), // whiteboard | mindmap
    title: (0, pg_core_1.text)('title').notNull(),
    data: (0, pg_core_1.jsonb)('data').notNull().default({}),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.workspaceCanvasesRelations = (0, drizzle_orm_1.relations)(exports.workspaceCanvases, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, {
        fields: [exports.workspaceCanvases.workspaceId],
        references: [workspaces_1.workspaces.id],
    }),
    createdBy: one(users_1.users, {
        fields: [exports.workspaceCanvases.createdById],
        references: [users_1.users.id],
    }),
}));
//# sourceMappingURL=workspace-canvases.js.map