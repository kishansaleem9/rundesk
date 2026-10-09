import { pgTable, text, timestamp, uuid, boolean, integer, uniqueIndex, index, check } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { projects } from './projects'
import { spaces } from './spaces'
import { tasks } from './tasks'
import { users } from './users'
import { containerVisibilityEnum } from './enums'

export const lists = pgTable('lists', {
  id:         uuid('id').primaryKey().defaultRandom(),
  projectId:  uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  /*
   * §G15 [21:49–21:54] — "pehle space hoti hai. Iske baad LIST aati hai."
   *
   * The space this list lives in, held directly rather than inferred by
   * joining through the project. Every list already has exactly one, so this
   * is a denormalisation of something already true (migration 0124), not a new
   * degree of freedom — and it is what lets "which space?" be answered without
   * a project in the middle.
   *
   * Nullable only because the backfill had to be, and because the column is
   * added before the writes that populate it. `assertSpaceMatchesProject` is
   * what keeps it honest while `project_id` is still required.
   */
  spaceId:    uuid('space_id').references(() => spaces.id, { onDelete: 'cascade' }),
  name:       text('name').notNull(),
  description: text('description'),
  position:   integer('position').notNull().default(0),
  // Which scope this list draws its statuses from: its own `list_statuses`
  // ('list', the default), the owning project's `project_statuses` ('project'),
  // or the owning space's `space_statuses` ('space'). See 0036_scoped_statuses.
  statusScope: text('status_scope').$type<'list' | 'project' | 'space'>().notNull().default('list'),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  isArchived: boolean('is_archived').notNull().default(false),
  // §13.4 Trash — when the item was deleted and by whom (null = unknown/legacy).
  archivedAt:   timestamp('archived_at', { withTimezone: true }),
  archivedById: uuid('archived_by_id').references(() => users.id, { onDelete: 'set null' }),
  // §2 per-item privacy: a 'private' list is visible only to its creator and
  // workspace managers/admins (enforced on every read path).
  visibility: containerVisibilityEnum('visibility').notNull().default('public'),
  /*
   * WHOSE PERSONAL LIST THIS IS, if it is one (`found-24-sep/planner-default-list-read-by-nothing`,
   * migration 0181): ClickUp's Personal List, where a task made with no
   * location lands, private to its owner. Private lists are their makers' and
   * a workspace's managers'; a Personal List is its owner's alone, managers
   * included, as ClickUp's is hidden from "other Workspace members". It lives
   * in the workspace's personal space (`spaces.is_personal`).
   */
  personalOf: uuid('personal_of').references(() => users.id, { onDelete: 'cascade' }),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  /**
   * §V2 frame `08:55` — "List name taken". Declared HERE as well as in
   * migration `0147`, and that is the whole of this fix.
   *
   * WHAT WENT WRONG. The constraint was written as raw SQL in the migration
   * and nowhere else. Production runs migrations, so it had the index;
   * `drizzle-kit push`, which builds a database from THIS file and is what CI
   * does on every run, did not. So the rule existed in the deployed database
   * and not in the schema that is supposed to describe it — and CI ran against
   * a database missing a constraint the product relies on.
   *
   * It went unnoticed locally for the worst possible reason: the index was
   * applied by hand there, so `list-name-taken` passed on this machine and
   * failed in CI, which reads as the suite being flaky rather than as the
   * schema and the migration disagreeing.
   *
   * The suite's own words for it: "the database accepted it — the rule lives
   * only in the service, so anything that writes lists another way can still
   * make two". That check is why this was caught at all rather than shipping
   * as a constraint nobody could see was missing.
   *
   * `lower(name)` because "Marketing" and "marketing" are the same name to a
   * person, and PARTIAL on `is_archived = false` because a list in the bin
   * must not hold its name hostage — both matching `assertListNameFree` in
   * `lists.service.ts`, which is the same rule stated where the API can give
   * a person a 409 and a sentence instead of a constraint violation.
   */
  uqNameActive: uniqueIndex('uq_lists_project_name_active')
    .on(t.projectId, sql`lower(${t.name})`)
    // Every Personal List is called one, side by side in the personal space's container (migration 0181).
    .where(sql`${t.isArchived} = false AND ${t.personalOf} IS NULL`),
  // One Personal List a person a workspace (the personal space's container is the workspace's own).
  uqPersonal: uniqueIndex('uq_lists_personal_per_project').on(t.projectId, t.personalOf).where(sql`${t.personalOf} IS NOT NULL`),
  // Made by 0036, 0084 and 0124. Declared here as well: a database built by
  // `drizzle-kit push` (the lanes, CI, a fresh deploy) reads only this file.
  archived: index('idx_lists_archived').on(t.isArchived, t.archivedAt),
  bySpace: index('idx_lists_space').on(t.spaceId),
  statusScope: check('lists_status_scope_check', sql`${t.statusScope} IN ('list', 'project', 'space')`),
}))

export const listsRelations = relations(lists, ({ one, many }) => ({
  project: one(projects, { fields: [lists.projectId], references: [projects.id] }),
  space: one(spaces, { fields: [lists.spaceId], references: [spaces.id] }),
  tasks:   many(tasks),
}))
