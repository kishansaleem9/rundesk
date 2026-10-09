import { pgTable, timestamp, uuid, primaryKey, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { tasks } from './tasks'
import { lists } from './lists'
import { users } from './users'

/**
 * TASKS IN MULTIPLE LISTS (`commit-log/log-713a611-1`), as ClickUp's ClickApp.
 *
 * A task's home list is `tasks.list_id`: where it was made, or moved to. This
 * holds the other lists of the workspace it has been added to. It is the same
 * task in each — one status (its home list's statuses), one set of people,
 * comments and files — and it is read in each by whoever may read that list.
 * Never its home list: the service refuses that, and a move into a list it was
 * added to takes the row away. Turning the ClickApp off removes them all.
 */
export const taskLists = pgTable(
  'task_lists',
  {
    taskId:    uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    listId:    uuid('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
    addedById: uuid('added_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk:     primaryKey({ columns: [t.taskId, t.listId], name: 'task_lists_pkey' }),
    byList: index('task_lists_list_idx').on(t.listId),
  }),
)

export const taskListsRelations = relations(taskLists, ({ one }) => ({
  task: one(tasks, { fields: [taskLists.taskId], references: [tasks.id] }),
  list: one(lists, { fields: [taskLists.listId], references: [lists.id] }),
}))
