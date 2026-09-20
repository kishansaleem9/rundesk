"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customReportsRelations = exports.customReports = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
/**
 * A saved custom report definition (metrics × dimension × filters + viz).
 * The definition is interpreted by ReportsService.runCustomReport at query time.
 *
 * §9.5 scheduled delivery: `schedule_frequency` ('none' | 'daily' | 'weekly')
 * plus a send hour (0–23 UTC) and, for weekly, a weekday (0=Sun … 6=Sat) drive
 * the hourly ScheduledReportsService cron. `schedule_recipients` is a jsonb array
 * of email addresses (empty ⇒ falls back to the report owner). `last_sent_at`
 * gates re-sends so a report is emailed at most once per period.
 */
exports.customReports = (0, pg_core_1.pgTable)('custom_reports', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    definition: (0, pg_core_1.jsonb)('definition').$type().notNull().default({}),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    scheduleFrequency: (0, pg_core_1.text)('schedule_frequency').$type().notNull().default('none'),
    scheduleHour: (0, pg_core_1.integer)('schedule_hour').notNull().default(8),
    scheduleDayOfWeek: (0, pg_core_1.integer)('schedule_day_of_week'),
    scheduleRecipients: (0, pg_core_1.jsonb)('schedule_recipients').$type().notNull().default([]),
    lastSentAt: (0, pg_core_1.timestamp)('last_sent_at', { withTimezone: true }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    byWorkspace: (0, pg_core_1.index)('idx_custom_reports_workspace').on(t.workspaceId),
    bySchedule: (0, pg_core_1.index)('idx_custom_reports_scheduled').on(t.scheduleFrequency).where((0, drizzle_orm_1.sql) `${t.scheduleFrequency} <> 'none'`),
}));
exports.customReportsRelations = (0, drizzle_orm_1.relations)(exports.customReports, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.customReports.workspaceId], references: [workspaces_1.workspaces.id] }),
    createdBy: one(users_1.users, { fields: [exports.customReports.createdById], references: [users_1.users.id] }),
}));
//# sourceMappingURL=custom-reports.js.map