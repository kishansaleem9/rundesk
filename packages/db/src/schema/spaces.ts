import { pgTable, text, timestamp, uuid, boolean, jsonb } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { projects } from './projects'
import { users } from './users'
import { containerVisibilityEnum } from './enums'

export const spaces = pgTable('spaces', {
  id:          uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name:        text('name').notNull(),
  description: text('description'),
  color:       text('color').default('#354fb0'),
  icon:        text('icon'),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  isArchived:  boolean('is_archived').notNull().default(false),
  // §13.4 Trash — when the item was deleted and by whom (null = unknown/legacy).
  archivedAt:   timestamp('archived_at', { withTimezone: true }),
  archivedById: uuid('archived_by_id').references(() => users.id, { onDelete: 'set null' }),
  visibility:  containerVisibilityEnum('visibility').notNull().default('public'),
  // §5 (ClickUp "required views") per-space view config: which of the task
  // views this space's lists expose, and which one opens by default. null =
  // all views enabled + 'list' default.
  viewConfig:  jsonb('view_config').$type<{ defaultView?: string; enabledViews?: string[] }>(),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const spacesRelations = relations(spaces, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [spaces.workspaceId], references: [workspaces.id] }),
  projects:  many(projects),
}))
