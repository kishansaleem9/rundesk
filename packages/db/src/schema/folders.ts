import { pgTable, text, timestamp, uuid, boolean, integer, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { spaces } from './spaces'
import { projects } from './projects'
import { users } from './users'
import { containerVisibilityEnum } from './enums'

/**
 * A Folder groups multiple projects inside a Space — the plan's Level-4
 * container (Org > Workspace > Space > Folder > Project). `projects.folderId`
 * is nullable: a null folder means the project sits directly under the space
 * ("ungrouped"), so folders are purely optional organisation.
 */
export const folders = pgTable(
  'folders',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    spaceId:     uuid('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
    name:        text('name').notNull(),
    color:       text('color').default('#354fb0'),
    position:    integer('position').notNull().default(0),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    isArchived:  boolean('is_archived').notNull().default(false),
    // §13.4 Trash — when the item was deleted and by whom (null = unknown/legacy).
    archivedAt:   timestamp('archived_at', { withTimezone: true }),
    archivedById: uuid('archived_by_id').references(() => users.id, { onDelete: 'set null' }),
    // §2 per-item privacy: a 'private' folder is visible only to its creator and
    // workspace managers/admins (enforced on every read path).
    visibility:  containerVisibilityEnum('visibility').notNull().default('public'),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_folders_space').on(t.spaceId, t.position)],
)

export const foldersRelations = relations(folders, ({ one, many }) => ({
  space:    one(spaces, { fields: [folders.spaceId], references: [spaces.id] }),
  projects: many(projects),
}))
