import { pgTable, text, timestamp, uuid, boolean, integer } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { projects } from './projects'
import { tasks } from './tasks'
import { users } from './users'

export const lists = pgTable('lists', {
  id:         uuid('id').primaryKey().defaultRandom(),
  projectId:  uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name:       text('name').notNull(),
  description: text('description'),
  position:   integer('position').notNull().default(0),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const listsRelations = relations(lists, ({ one, many }) => ({
  project: one(projects, { fields: [lists.projectId], references: [projects.id] }),
  tasks:   many(tasks),
}))
