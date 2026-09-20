"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectTemplatesRelations = exports.projectTemplates = exports.TEMPLATE_USE_CASES = exports.TEMPLATE_CATEGORIES = exports.TEMPLATE_COMPLEXITIES = exports.TEMPLATE_TARGET_TYPES = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
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
exports.TEMPLATE_TARGET_TYPES = ['space', 'folder', 'list'];
exports.TEMPLATE_COMPLEXITIES = ['beginner', 'intermediate', 'advanced'];
/** The body sections the gallery groups into (frame: "Marketing", "PMO …"). */
exports.TEMPLATE_CATEGORIES = ['engineering', 'marketing', 'operations', 'product'];
/** The job a template does — the frame's top-bar "Use Cases" dropdown. */
exports.TEMPLATE_USE_CASES = ['planning', 'launch', 'onboarding', 'support'];
/**
 * Project templates — a reusable scaffold of (project + lists + task stubs)
 * that an admin can save once and re-apply when starting new work.
 *
 * The full structure is denormalized into `payload` so that template
 * application is a pure read of a single row plus a tx of inserts —
 * no risk of drift from later edits to the original project.
 */
exports.projectTemplates = (0, pg_core_1.pgTable)('project_templates', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    // Templates with workspaceId = null are platform-wide built-ins.
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    icon: (0, pg_core_1.text)('icon'),
    // { lists: [{ name, position, tasks: [{ title, description, priority, status }] }] }
    payload: (0, pg_core_1.jsonb)('payload')
        .$type()
        .notNull(),
    isBuiltIn: (0, pg_core_1.boolean)('is_built_in').notNull().default(false),
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
    targetType: (0, pg_core_1.text)('target_type').$type().notNull().default('folder'),
    complexity: (0, pg_core_1.text)('complexity').$type().notNull().default('beginner'),
    category: (0, pg_core_1.text)('category').$type(),
    useCase: (0, pg_core_1.text)('use_case').$type(),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    // Platform-wide built-ins are keyed by name; this makes idempotent seeding
    // race-safe (concurrent boots can't create duplicate built-in templates).
    builtInName: (0, pg_core_1.uniqueIndex)('uq_builtin_template_name').on(t.name).where((0, drizzle_orm_1.sql) `${t.workspaceId} IS NULL`),
    // The facet counts are four GROUP BYs over (built-ins + one workspace); this
    // is the column every one of them narrows on first.
    wsScope: (0, pg_core_1.index)('ix_project_templates_ws_scope').on(t.workspaceId, t.targetType),
}));
exports.projectTemplatesRelations = (0, drizzle_orm_1.relations)(exports.projectTemplates, ({ one }) => ({
    workspace: one(workspaces_1.workspaces, {
        fields: [exports.projectTemplates.workspaceId],
        references: [workspaces_1.workspaces.id],
    }),
    createdBy: one(users_1.users, {
        fields: [exports.projectTemplates.createdById],
        references: [users_1.users.id],
    }),
}));
//# sourceMappingURL=templates.js.map