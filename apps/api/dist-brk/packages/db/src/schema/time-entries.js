"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timeEntriesRelations = exports.timeEntries = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const tasks_1 = require("./tasks");
const users_1 = require("./users");
exports.timeEntries = (0, pg_core_1.pgTable)('time_entries', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    taskId: (0, pg_core_1.uuid)('task_id').notNull().references(() => tasks_1.tasks.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    startedAt: (0, pg_core_1.timestamp)('started_at', { withTimezone: true }).notNull(),
    endedAt: (0, pg_core_1.timestamp)('ended_at', { withTimezone: true }),
    durationSec: (0, pg_core_1.integer)('duration_sec'), // null while timer is running; set on stop or on manual create
    description: (0, pg_core_1.text)('description'),
    isBillable: (0, pg_core_1.boolean)('is_billable').notNull().default(false),
    // §12.10 — set once this entry's billable time has been rolled into a client
    // invoice, so it is never double-invoiced. Plain column; the FK to
    // client_invoices is added in the migration to avoid a schema import cycle.
    clientInvoiceId: (0, pg_core_1.uuid)('client_invoice_id'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.timeEntriesRelations = (0, drizzle_orm_1.relations)(exports.timeEntries, ({ one }) => ({
    task: one(tasks_1.tasks, { fields: [exports.timeEntries.taskId], references: [tasks_1.tasks.id] }),
    user: one(users_1.users, { fields: [exports.timeEntries.userId], references: [users_1.users.id] }),
}));
//# sourceMappingURL=time-entries.js.map