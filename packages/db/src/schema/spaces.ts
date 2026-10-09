import { pgTable, text, timestamp, uuid, boolean, jsonb, index, check, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { projects } from './projects'
import { users } from './users'
import { containerVisibilityEnum } from './enums'

/**
 * The rungs a space's default permission can sit on — the same ladder as
 * `object_shares.level`, weakest first.
 */
export type SpaceDefaultPermission = 'view' | 'comment' | 'edit' | 'admin'

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
  /**
   * §V2-06, frame `06:52` — "Default permission  Full edit ▾".
   *
   * What a workspace member gets on this space without an explicit grant.
   * Deliberately the same four rungs as `object_shares.level`
   * (view < comment < edit < admin) rather than a second vocabulary. ClickUp's
   * "Full edit" is `admin` — it makes and deletes; `edit` is ClickUp's "Edit",
   * which changes and archives and does neither — and a public location's
   * default is Full edit (`docs/share-and-permissions-spec.md`). It said
   * "Full edit is `edit`" here, and nothing asked `admin`, until
   * `found-25-sep/full-edit-enforced-nowhere` (migration 0164).
   */
  defaultPermission: text('default_permission')
    .$type<SpaceDefaultPermission>()
    .notNull()
    .default('admin'),
  /**
   * §V2-06, frame `07:19` — "Enable ClickApps": which of this space's optional
   * features are on. `null` means every one of them, so a space made before
   * this column existed behaves exactly as it did.
   *
   * Only features Rundesk ACTUALLY HAS get a key here. ClickUp's grid includes
   * entries Rundesk has no equivalent for, and a switch that toggles nothing
   * is worse than an absent switch, because the absent one is honest.
   */
  features:    jsonb('features').$type<Record<string, boolean>>(),
  /**
   * Which workflow preset made this space (frame `07:06`), or null for one
   * made before presets existed. Kept because `[07:46]` — "yeh LIST
   * automatically generate kar deta hai … us base pe jo aap ne ooper di ho" —
   * means the preset had consequences, and a space with a seeded list and no
   * record of why is a space nobody can explain later.
   */
  presetKey:   text('preset_key'),
  /*
   * THE WORKSPACE'S PERSONAL LISTS LIVE HERE (`found-24-sep/planner-default-list-read-by-nothing`,
   * migration 0181). ClickUp gives each person a Personal List, "the default
   * location for new tasks", private to them and "not part of the Workspace
   * hierarchy". It is held in a space of the workspace's own, one per
   * workspace, so every rule a task answers to reaches it as any other list —
   * and this flag keeps that space out of the hierarchy anybody is shown: the
   * sidebar, the Move picker, search. Its lists are their owners' alone
   * (`lists.personal_of`).
   */
  isPersonal:  boolean('is_personal').notNull().default(false),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Made by 0084 and 0136. Declared here as well: a database built by
  // `drizzle-kit push` (the lanes, CI, a fresh deploy) reads only this file.
  index('idx_spaces_archived').on(t.isArchived, t.archivedAt),
  check('chk_spaces_default_permission', sql`${t.defaultPermission} IN ('view', 'comment', 'edit', 'admin')`),
  // One personal space a workspace: two people's first Personal List made at once both find none, and one insert wins.
  uniqueIndex('uq_spaces_personal_per_workspace').on(t.workspaceId).where(sql`${t.isPersonal}`),
])

export const spacesRelations = relations(spaces, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [spaces.workspaceId], references: [workspaces.id] }),
  projects:  many(projects),
}))
