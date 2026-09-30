import { pgTable, text, timestamp, uuid, boolean, integer, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
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
  // Optional client this project bills to (Plan §9). FK declared in migration
  // 0047 (kept out of Drizzle to avoid a projects<->clients import cycle).
  clientId:    uuid('client_id'),
  position:    integer('position').notNull().default(0),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  isArchived:  boolean('is_archived').notNull().default(false),
  // §13.4 Trash — when the item was deleted and by whom (null = unknown/legacy).
  archivedAt:   timestamp('archived_at', { withTimezone: true }),
  archivedById: uuid('archived_by_id').references(() => users.id, { onDelete: 'set null' }),
  visibility:  containerVisibilityEnum('visibility'),
  // Time logged on this project's tasks defaults to billable when true (§8.3).
  defaultBillable: boolean('default_billable').notNull().default(false),
  /*
   * §G15-10 — the container behind "a List that lives in a Space".
   *
   * She creates a List by choosing a Space; ours needed a Project in between.
   * Rather than make `lists.project_id` nullable — which would strand a list
   * outside the 114 joins that reach its workspace through its project, the
   * resource guard included — the space keeps one hidden container and the list
   * goes in it. One per space (partial unique index, migration 0129), created
   * on demand, never listed and never offered as a destination.
   */
  isDefaultContainer: boolean('is_default_container').notNull().default(false),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Made by 0034, 0084 and 0129. Declared here as well: a database built by
  // `drizzle-kit push` (the lanes, CI, a fresh deploy) reads only this file.
  index('idx_projects_folder').on(t.folderId),
  index('idx_projects_archived').on(t.isArchived, t.archivedAt),
  uniqueIndex('uq_projects_default_container_per_space').on(t.spaceId).where(sql`${t.isDefaultContainer}`),
])

export const projectsRelations = relations(projects, ({ one, many }) => ({
  space: one(spaces, { fields: [projects.spaceId], references: [spaces.id] }),
  lists: many(lists),
}))
