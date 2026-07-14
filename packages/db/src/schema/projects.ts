import { pgTable, text, timestamp, uuid, boolean, integer } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { spaces } from './spaces'
import { lists } from './lists'
import { users } from './users'
import { containerVisibilityEnum } from './enums'

export const projects = pgTable('projects', {
  id:          uuid('id').primaryKey().defaultRandom(),
  spaceId:     uuid('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
  name:        text('name').notNull(),
  description: text('description'),
  color:       text('color').default('#354fb0'),
  icon:        text('icon'),
  // Optional Level-4 grouping. Null = project sits directly under the space.
  // The FK to folders is declared in migration 0034 (kept out of the Drizzle
  // schema to avoid a folders<->projects import cycle).
  folderId:    uuid('folder_id'),
  position:    integer('position').notNull().default(0),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  isArchived:  boolean('is_archived').notNull().default(false),
  visibility:  containerVisibilityEnum('visibility'),
  // Time logged on this project's tasks defaults to billable when true (§8.3).
  defaultBillable: boolean('default_billable').notNull().default(false),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const projectsRelations = relations(projects, ({ one, many }) => ({
  space: one(spaces, { fields: [projects.spaceId], references: [spaces.id] }),
  lists: many(lists),
}))
