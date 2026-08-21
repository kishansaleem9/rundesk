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
    /**
     * §1.1 — does wearing this type make a task a milestone?
     *
     * tasks.isMilestone already drove the diamond on the timeline, the badge in
     * lists and the client portal, and it shipped long before task types. When
     * types arrived with a "Milestone" among them, the two were unrelated:
     * setting the type did not draw the diamond, and drawing the diamond did not
     * make the task findable by the Milestone type filter. This is the link.
     * The type is what you set; tasks.isMilestone stays what everything renders
     * from, kept in step by the service.
     */
    isMilestone: boolean('is_milestone').notNull().default(false),
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

/**
 * §1.1 — what a workspace starts with.
 *
 * Lives beside the table rather than in one service because workspaces are
 * created from two places: workspaces.service.create() and, for the very first
 * workspace of a new account, auth.service.signUp() which inserts the row
 * itself. Seeding only the first left every account created through signup with
 * no types at all — and all three type controls hide themselves when a
 * workspace has none, so the feature was invisible on exactly the path most
 * workspaces are born on.
 *
 * Migration 0093 backfills the same pair into workspaces that predate this.
 */
export const DEFAULT_TASK_TYPES = [
  { name: 'Task', icon: '\u2713', isDefault: true, isMilestone: false, position: 0 },
  // §1.1 — isMilestone links this to tasks.is_milestone, which is what the
  // timeline diamond, the list badge and the client portal render from.
  { name: 'Milestone', icon: '\u25c6', isDefault: false, isMilestone: true, position: 1 },
] as const
