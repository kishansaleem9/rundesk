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
    /**
     * §V2-04 — what MADE a task of this type, when something other than a
     * person did.
     *
     * `[03:26]` "MILESTONE, FORM RESPONSE, ya MEETING NOTE se task create hue"
     * — the type is how you see where a task came from. Rundesk already creates
     * tasks from form submissions and from meeting notes, and neither stamped a
     * type, so the provenance existed in the data and nowhere on screen.
     *
     * A marker rather than a name match, for the same reason `isMilestone` is
     * one: the vocabulary is the workspace's to change. A team that renames
     * "Form Response" to "Enquiry", or runs in Urdu, still gets its form tasks
     * stamped — matching on the string would stop the moment anyone touched it,
     * and stop silently.
     *
     * Null for every type a person made. `'form'` and `'meeting'` are the two
     * Rundesk fills in today.
     */
    origin:      text('origin'),
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
  { name: 'Task', icon: '\u2713', isDefault: true, isMilestone: false, origin: null, position: 0 },
  // §1.1 — isMilestone links this to tasks.is_milestone, which is what the
  // timeline diamond, the list badge and the client portal render from.
  { name: 'Milestone', icon: '\u25c6', isDefault: false, isMilestone: true, origin: null, position: 1 },
  /*
   * \u00a7V2-04 \u2014 the two she names alongside Milestone at `[03:26]`.
   *
   * Both are provenance. Rundesk already turns a form submission into a task
   * (`forms.service.createTaskForSubmission`) and a meeting's action items into
   * tasks (`meetings.service`), and neither said so on the task itself.
   * `origin` is what those two services look themselves up by, so the stamping
   * survives a workspace renaming them.
   */
  { name: 'Form Response', icon: '\u25a4', isDefault: false, isMilestone: false, origin: 'form', position: 2 },
  { name: 'Meeting Note', icon: '\u270e', isDefault: false, isMilestone: false, origin: 'meeting', position: 3 },
] as const
