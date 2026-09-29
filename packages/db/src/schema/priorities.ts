import { pgTable, text, timestamp, uuid, integer, index, uniqueIndex, check, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'
import { tasks } from './tasks'

/**
 * §G06 [05:54] — "meri PRIORITIES kya hain — yaani ke aaj ke din mein mere
 * kaun se important task hain jo karne hain."
 *
 * The one thing on that profile panel that is a *decision* rather than a
 * derived list. Everything else there — assigned to me, today and overdue,
 * recent activity — is the app telling you what it already knows. This is the
 * person saying "out of all of that, these are the ones that matter today",
 * and nothing in the product could hold that answer.
 *
 * Favourites are the nearest existing thing and are not it: a favourite pins a
 * task into the sidebar rail permanently. That is a bookmark. This is a short,
 * ordered, disposable list you rewrite most mornings.
 *
 * Two kinds of row on purpose. A priority can point at a task you already have
 * — which keeps it live, so its title and status follow the task — or it can be
 * a line you typed, because "call the accountant" is a real priority that does
 * not deserve a task with a list and a status behind it. Requiring a task
 * first would make the fast case slow, which is how a daily list stops being
 * used by the second week.
 *
 * Deliberately NOT cleared at midnight. "Today's" describes what it is for,
 * not a retention policy — and a list that empties itself overnight loses work
 * somebody did on purpose. Ticking things off is how it clears.
 *
 * AND NOT ONLY THE OWNER WRITES IT (`ledger-rows/row-850`). ClickUp lets a
 * member, admin or owner add a task to somebody else's priorities — assigning
 * offers "Add this task to <name>'s priorities?" — and the owner's list says
 * who added each one and when. So a row records who put it there; the list
 * stays its owner's to tick, order and clear.
 */
export const userPriorities = pgTable(
  'user_priorities',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    /** The task this points at, when it points at one. */
    taskId:      uuid('task_id').references((): AnyPgColumn => tasks.id, { onDelete: 'cascade' }),
    /** The typed line, when it is not a task. */
    title:       text('title'),
    /** Hand-ordered: the point of the list is which one is first. */
    position:    integer('position').notNull().default(0),
    /** Ticked off. Kept rather than deleted so "I did that today" survives. */
    doneAt:      timestamp('done_at', { withTimezone: true }),
    /**
     * Who put it on the list: the owner, or a colleague who added a task to it
     * (`ledger-rows/row-850`); `createdAt` is when. Null on a row written before
     * this was kept, when only the owner could write one, and once the one who
     * added it is gone — the row is the owner's and stays.
     */
    addedById:   uuid('added_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // The read: "my priorities in this workspace, in my order".
    byOwner: index('user_priorities_owner_idx').on(t.userId, t.workspaceId, t.position),
    /*
     * The same task cannot be a priority twice.
     *
     * Partial, so it constrains only the rows that point at a task — typed
     * lines are free to repeat, because "chase the invoice" twice in a week is
     * a person doing it twice, not a duplicate.
     */
    uniqTask: uniqueIndex('user_priorities_unique_task')
      .on(t.userId, t.workspaceId, t.taskId)
      .where(sql`${t.taskId} is not null`),
    // A priority is a task or a line — never neither.
    hasSubject: check('user_priorities_has_subject', sql`${t.taskId} is not null or ${t.title} is not null`),
  }),
)

export const userPrioritiesRelations = relations(userPriorities, ({ one }) => ({
  user:      one(users,      { fields: [userPriorities.userId], references: [users.id] }),
  workspace: one(workspaces, { fields: [userPriorities.workspaceId], references: [workspaces.id] }),
  task:      one(tasks,      { fields: [userPriorities.taskId], references: [tasks.id] }),
}))
