import { pgTable, text, timestamp, boolean, uuid, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

/**
 * §V2-13 / frame `12:14` — the Template Center's browse facets.
 *
 * These four arrays ARE the vocabulary and ARE the order the rail draws them
 * in. They live here, once, because the frame's rail is a list that would
 * otherwise get written out in the seed, the service, the API contract and the
 * page — four copies, three of which drift (see "the duplicated list"). The
 * server sends the values with their counts and the web app renders what it was
 * sent; it holds labels, not a second vocabulary.
 *
 * `TEMPLATE_TARGET_TYPES` is deliberately THREE of the frame's seven. Space,
 * Folder and List are the three a project template can genuinely BE, and
 * `apply` honours all three. Task and Doc templates are separate tables with
 * their own surfaces (`task_templates`, `doc_templates`); View and Whiteboard
 * templates do not exist in Rundesk at all. Offering those four here would be
 * four checkboxes that can only ever return nothing — a facade with a count
 * beside it.
 */
export const TEMPLATE_TARGET_TYPES = ['space', 'folder', 'list'] as const
export type TemplateTargetType = (typeof TEMPLATE_TARGET_TYPES)[number]

export const TEMPLATE_COMPLEXITIES = ['beginner', 'intermediate', 'advanced'] as const
export type TemplateComplexity = (typeof TEMPLATE_COMPLEXITIES)[number]

/** The body sections the gallery groups into (frame: "Marketing", "PMO …"). */
export const TEMPLATE_CATEGORIES = ['engineering', 'marketing', 'operations', 'product'] as const
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

/** The job a template does — the frame's top-bar "Use Cases" dropdown. */
export const TEMPLATE_USE_CASES = ['planning', 'launch', 'onboarding', 'support'] as const
export type TemplateUseCase = (typeof TEMPLATE_USE_CASES)[number]

/**
 * Project templates — a reusable scaffold of (project + lists + task stubs)
 * that an admin can save once and re-apply when starting new work.
 *
 * The full structure is denormalized into `payload` so that template
 * application is a pure read of a single row plus a tx of inserts —
 * no risk of drift from later edits to the original project.
 */
export const projectTemplates = pgTable('project_templates', {
  id:           uuid('id').primaryKey().defaultRandom(),
  workspaceId:  uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
  // Templates with workspaceId = null are platform-wide built-ins.
  name:         text('name').notNull(),
  description:  text('description'),
  icon:         text('icon'),
  // { lists: [{ name, position, tasks: [{ title, description, priority, status }] }] }
  payload:      jsonb('payload')
                  .$type<{
                    lists: Array<{
                      name: string
                      position?: number
                      tasks: Array<{
                        title: string
                        description?: string | null
                        priority?: 'urgent' | 'high' | 'normal' | 'low'
                        status?: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'cancelled'
                      }>
                    }>
                  }>()
                  .notNull(),
  isBuiltIn:    boolean('is_built_in').notNull().default(false),
  /**
   * §V2-13 — the Template Center's four browse facets (migration 0151).
   *
   * `targetType` says what applying this template PRODUCES, and `apply` reads
   * it: 'space' makes a space, 'folder' a project, 'list' a single list. It is
   * not decoration on the card — pick a different value and a different thing
   * gets created.
   *
   * `complexity` is derived from the snapshot when a template is saved from a
   * project (lists × tasks), or stated for the built-in catalog. `category`
   * and `useCase` are nullable because a template saved without one is a real
   * state; the gallery gives those an "Other" section rather than guessing.
   */
  targetType:   text('target_type').$type<TemplateTargetType>().notNull().default('folder'),
  complexity:   text('complexity').$type<TemplateComplexity>().notNull().default('beginner'),
  category:     text('category').$type<TemplateCategory>(),
  useCase:      text('use_case').$type<TemplateUseCase>(),
  createdById:  uuid('created_by_id').references(() => users.id),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Platform-wide built-ins are keyed by name; this makes idempotent seeding
  // race-safe (concurrent boots can't create duplicate built-in templates).
  builtInName: uniqueIndex('uq_builtin_template_name').on(t.name).where(sql`${t.workspaceId} IS NULL`),
  // The facet counts are four GROUP BYs over (built-ins + one workspace); this
  // is the column every one of them narrows on first.
  wsScope:     index('ix_project_templates_ws_scope').on(t.workspaceId, t.targetType),
}))

export const projectTemplatesRelations = relations(projectTemplates, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [projectTemplates.workspaceId],
    references: [workspaces.id],
  }),
  createdBy: one(users, {
    fields: [projectTemplates.createdById],
    references: [users.id],
  }),
}))
