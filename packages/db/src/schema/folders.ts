import { pgTable, text, timestamp, uuid, boolean, integer, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
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
  (t) => [
    index('idx_folders_space').on(t.spaceId, t.position),
    /**
     * §V2-S10 frame `08:25` — "FOLDER banaya … folder ka bhi SAME NAAM dete
     * hain" `[08:23]`, and `[08:55]` on the error that should answer.
     *
     * The same rule `lists` got in migration 0147, for the sibling container
     * created from the same menu, and stated in the same three ways so the two
     * cannot drift:
     *
     *   · `lower(name)`, because "Clients" and "clients" are one name to the
     *     person reading the tree;
     *   · PARTIAL on `is_archived = false`, because `remove()` archives rather
     *     than deletes and a folder in the Trash must not reserve its name for
     *     ever;
     *   · scoped to the SPACE, which is the container the sidebar draws folders
     *     under. Two spaces may each have a "Clients"; one space may not.
     *
     * Declared here AND written as migration 0157. The schema is compiled from
     * source at require time, so a declaration with no migration behind it is a
     * constraint that exists on the developer's machine and nowhere else —
     * which is precisely how 0147 was nearly shipped without its index.
     */
    uniqueIndex('uq_folders_space_name_active')
      .on(t.spaceId, sql`lower(${t.name})`)
      .where(sql`${t.isArchived} = false`),
  ],
)

export const foldersRelations = relations(folders, ({ one, many }) => ({
  space:    one(spaces, { fields: [folders.spaceId], references: [spaces.id] }),
  projects: many(projects),
}))
