import { pgTable, text, timestamp, uuid, integer, unique, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { projects } from './projects'
import type { StatusCategory } from './tasks'

/**
 * Project-scoped status template (see 0036_scoped_statuses).
 *
 * Mirrors `list_statuses` but lives at the Project level so a status pipeline
 * can be defined once and shared by every list in the project whose
 * `status_scope` is 'project'. Backfilled losslessly from the project's
 * existing list statuses.
 */
export const projectStatuses = pgTable(
  'project_statuses',
  {
    id:        uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    key:       text('key').notNull(),
    name:      text('name').notNull(),
    color:     text('color').notNull().default('#94a3b8'),
    category:  text('category').$type<StatusCategory>().notNull().default('open'),
    position:  integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_project_statuses_project_key').on(t.projectId, t.key),
    index('idx_project_statuses_project_position').on(t.projectId, t.position),
  ],
)

export const projectStatusesRelations = relations(projectStatuses, ({ one }) => ({
  project: one(projects, { fields: [projectStatuses.projectId], references: [projects.id] }),
}))
