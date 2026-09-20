"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectStatusesRelations = exports.projectStatuses = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const projects_1 = require("./projects");
/**
 * Project-scoped status template (see 0036_scoped_statuses).
 *
 * Mirrors `list_statuses` but lives at the Project level so a status pipeline
 * can be defined once and shared by every list in the project whose
 * `status_scope` is 'project'. Backfilled losslessly from the project's
 * existing list statuses.
 */
exports.projectStatuses = (0, pg_core_1.pgTable)('project_statuses', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    projectId: (0, pg_core_1.uuid)('project_id').notNull().references(() => projects_1.projects.id, { onDelete: 'cascade' }),
    key: (0, pg_core_1.text)('key').notNull(),
    name: (0, pg_core_1.text)('name').notNull(),
    color: (0, pg_core_1.text)('color').notNull().default('#94a3b8'),
    category: (0, pg_core_1.text)('category').$type().notNull().default('open'),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_project_statuses_project_key').on(t.projectId, t.key),
    (0, pg_core_1.index)('idx_project_statuses_project_position').on(t.projectId, t.position),
]);
exports.projectStatusesRelations = (0, drizzle_orm_1.relations)(exports.projectStatuses, ({ one }) => ({
    project: one(projects_1.projects, { fields: [exports.projectStatuses.projectId], references: [projects_1.projects.id] }),
}));
//# sourceMappingURL=project-statuses.js.map