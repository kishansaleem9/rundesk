"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timeApprovalsRelations = exports.timeApprovals = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
exports.timeApprovals = (0, pg_core_1.pgTable)('time_approvals', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    weekStart: (0, pg_core_1.date)('week_start').notNull(),
    status: (0, pg_core_1.text)('status').notNull().default('pending'),
    rejectionReason: (0, pg_core_1.text)('rejection_reason'),
    approvedById: (0, pg_core_1.uuid)('approved_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    approvedAt: (0, pg_core_1.timestamp)('approved_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    workspaceUserWeekUnique: (0, pg_core_1.uniqueIndex)('time_approvals_workspace_user_week_unique').on(table.workspaceId, table.userId, table.weekStart),
}));
exports.timeApprovalsRelations = (0, drizzle_orm_1.relations)(exports.timeApprovals, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.timeApprovals.workspaceId], references: [workspaces_1.workspaces.id] }),
    user: one(users_1.users, { fields: [exports.timeApprovals.userId], references: [users_1.users.id] }),
    approvedBy: one(users_1.users, { fields: [exports.timeApprovals.approvedById], references: [users_1.users.id] }),
}));
//# sourceMappingURL=time-approvals.js.map