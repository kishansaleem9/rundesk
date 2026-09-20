"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timeOffRelations = exports.timeOff = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
/**
 * §A4.10 Days off / time away. The useful slice of ClickUp's work-schedule
 * model: someone on leave should stop absorbing planned load in the workload
 * heat-map, so the plan reflects who is actually available.
 *
 * Both bounds are inclusive calendar `date`s — leave is a calendar concept, and
 * storing it as a timestamp would shift a person's last day by a timezone.
 */
exports.timeOff = (0, pg_core_1.pgTable)('time_off', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    startsOn: (0, pg_core_1.date)('starts_on').notNull(),
    endsOn: (0, pg_core_1.date)('ends_on').notNull(),
    note: (0, pg_core_1.text)('note'),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.index)('idx_time_off_workspace_range').on(t.workspaceId, t.startsOn, t.endsOn),
    (0, pg_core_1.index)('idx_time_off_user').on(t.userId),
]);
exports.timeOffRelations = (0, drizzle_orm_1.relations)(exports.timeOff, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.timeOff.workspaceId], references: [workspaces_1.workspaces.id] }),
    user: one(users_1.users, { fields: [exports.timeOff.userId], references: [users_1.users.id] }),
}));
//# sourceMappingURL=time-off.js.map