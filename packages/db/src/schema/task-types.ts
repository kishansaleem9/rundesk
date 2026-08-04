import { pgTable, text, timestamp, uuid, boolean, integer, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { workspaces } from './workspaces'

/**
 * What a task *is* — Task, Milestone, Campaign, Invoice. ClickUp calls these
 * Task Types. Workspace-scoped, because the vocabulary a team works in is a
 * property of that team.
 *
 * A task keeps its own row when a type is deleted (`SET NULL`): losing the
 * label must never lose the work.
 */
export const taskTypes = pgTable(
  'task_types',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    name:        text('name').notNull(),
    /** Emoji or short token shown beside the task title. */
    icon:        text('icon'),
    color:       text('color'),
    /** Applied to new tasks when none is chosen; at most one per workspace. */
    isDefault:   boolean('is_default').notNull().default(false),
    position:    integer('position').notNull().default(0),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index('task_types_workspace_idx').on(t.workspaceId),
    oneDefault:  uniqueIndex('uq_task_types_one_default').on(t.workspaceId).where(sql`${t.isDefault}`),
  }),
)

export const taskTypesRelations = relations(taskTypes, ({ one }) => ({
  workspace: one(workspaces, { fields: [taskTypes.workspaceId], references: [workspaces.id] }),
}))
