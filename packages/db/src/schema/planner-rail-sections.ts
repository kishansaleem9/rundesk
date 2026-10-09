import { pgTable, text, timestamp, uuid, integer, index, uniqueIndex, primaryKey, foreignKey } from 'drizzle-orm/pg-core'
import { users } from './users'
import { workspaces } from './workspaces'
import { tasks } from './tasks'

/**
 * A SECTION OF ONE'S OWN IN THE PLANNER'S RAIL — "+ Add a new section" on the
 * planner settings' Sidebar page, frame `14:14` (`commit-log/log-716d25c-1`,
 * `ledger-rows/row-835`).
 *
 * No frame says what a new section holds, and ClickUp's Planner pages do not
 * either. ClickUp's own custom sections are the Home Sidebar's: made with
 * + › Section, a name and an optional emoji, filled by hand — each item in one
 * section at a time — reordered among the sidebar's sections, and deleted
 * without deleting what they hold. So here: a person's section in one
 * workspace, holding the tasks they put in it.
 *
 * Its place among the rail's five is `railSections` (`section:<id>`), the one
 * order the Sidebar page edits; a section the order does not name yet is drawn
 * at the foot of the rail, where a new one goes.
 */
export const plannerRailSections = pgTable(
  'planner_rail_sections',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name:        text('name').notNull(),
    /** ClickUp's optional emoji before the name. */
    emoji:       text('emoji'),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_planner_rail_sections_user_workspace').on(t.userId, t.workspaceId)],
)

/**
 * A task put in a section, by the section's owner. A task is in one of a
 * person's sections at a time — putting it in another moves it — and leaving
 * the section leaves the task as it was.
 */
export const plannerRailSectionTasks = pgTable(
  'planner_rail_section_tasks',
  {
    sectionId: uuid('section_id').notNull(),
    taskId:    uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    /** The section's owner, here so "one section at a time" is a unique index, not a race. */
    userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    position:  integer('position').notNull().default(0),
    addedAt:   timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.sectionId, t.taskId] }),
    // Named: the name push gives it is 66 characters, which Postgres cuts to 63 and push then re-adds on every run.
    foreignKey({ columns: [t.sectionId], foreignColumns: [plannerRailSections.id], name: 'planner_rail_section_tasks_section_id_fk' }).onDelete('cascade'),
    uniqueIndex('uq_planner_rail_section_tasks_user_task').on(t.userId, t.taskId),
    index('idx_planner_rail_section_tasks_task').on(t.taskId),
  ],
)

export type PlannerRailSection = typeof plannerRailSections.$inferSelect
