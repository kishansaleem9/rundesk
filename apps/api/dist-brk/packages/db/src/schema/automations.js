"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.automationRunsRelations = exports.automationsRelations = exports.automationRuns = exports.automations = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
// ─── Automation Rules ─────────────────────────────────────────────────────────
//
// Trigger types: task.created | task.status_changed | task.due_passed |
//                task.comment_added | task.assignee_changed | task.overdue
//
// Action types: change_status | assign_member | set_priority |
//               send_notification | create_subtask | post_to_channel
exports.automations = (0, pg_core_1.pgTable)('automations', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    name: (0, pg_core_1.text)('name').notNull(),
    isEnabled: (0, pg_core_1.boolean)('is_enabled').notNull().default(true),
    // Trigger definition
    // { type: 'task.status_changed', filters: { fromStatus?: string, toStatus?: string, projectId?: string } }
    trigger: (0, pg_core_1.jsonb)('trigger').notNull().$type(),
    // Array of action definitions
    // [{ type: 'change_status', params: { status: 'done' } }, ...]
    actions: (0, pg_core_1.jsonb)('actions').notNull().$type(),
    // Stats
    runCount: (0, pg_core_1.integer)('run_count').notNull().default(0),
    lastRunAt: (0, pg_core_1.timestamp)('last_run_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
// Run log — record of each time an automation fired
exports.automationRuns = (0, pg_core_1.pgTable)('automation_runs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    automationId: (0, pg_core_1.uuid)('automation_id').notNull().references(() => exports.automations.id, { onDelete: 'cascade' }),
    triggeredAt: (0, pg_core_1.timestamp)('triggered_at', { withTimezone: true }).notNull().defaultNow(),
    // context: { taskId, userId, changedField, etc. }
    context: (0, pg_core_1.jsonb)('context').$type(),
    // outcome: 'success' | 'error'
    outcome: (0, pg_core_1.text)('outcome').notNull().default('success'),
    errorMsg: (0, pg_core_1.text)('error_msg'),
});
// ─── Relations ────────────────────────────────────────────────────────────────
exports.automationsRelations = (0, drizzle_orm_1.relations)(exports.automations, ({ one, many }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.automations.workspaceId], references: [workspaces_1.workspaces.id] }),
    createdBy: one(users_1.users, { fields: [exports.automations.createdById], references: [users_1.users.id] }),
    runs: many(exports.automationRuns),
}));
exports.automationRunsRelations = (0, drizzle_orm_1.relations)(exports.automationRuns, ({ one }) => ({
    automation: one(exports.automations, { fields: [exports.automationRuns.automationId], references: [exports.automations.id] }),
}));
//# sourceMappingURL=automations.js.map