"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listsRelations = exports.lists = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const projects_1 = require("./projects");
const spaces_1 = require("./spaces");
const tasks_1 = require("./tasks");
const users_1 = require("./users");
const enums_1 = require("./enums");
exports.lists = (0, pg_core_1.pgTable)('lists', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    projectId: (0, pg_core_1.uuid)('project_id').notNull().references(() => projects_1.projects.id, { onDelete: 'cascade' }),
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
    spaceId: (0, pg_core_1.uuid)('space_id').references(() => spaces_1.spaces.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    position: (0, pg_core_1.integer)('position').notNull().default(0),
    // Which scope this list draws its statuses from: its own `list_statuses`
    // ('list', the default), the owning project's `project_statuses` ('project'),
    // or the owning space's `space_statuses` ('space'). See 0036_scoped_statuses.
    statusScope: (0, pg_core_1.text)('status_scope').$type().notNull().default('list'),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    isArchived: (0, pg_core_1.boolean)('is_archived').notNull().default(false),
    // §13.4 Trash — when the item was deleted and by whom (null = unknown/legacy).
    archivedAt: (0, pg_core_1.timestamp)('archived_at', { withTimezone: true }),
    archivedById: (0, pg_core_1.uuid)('archived_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    // §2 per-item privacy: a 'private' list is visible only to its creator and
    // workspace managers/admins (enforced on every read path).
    visibility: (0, enums_1.containerVisibilityEnum)('visibility').notNull().default('public'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
    uqNameActive: (0, pg_core_1.uniqueIndex)('uq_lists_project_name_active')
        .on(t.projectId, (0, drizzle_orm_1.sql) `lower(${t.name})`)
        .where((0, drizzle_orm_1.sql) `${t.isArchived} = false`),
}));
exports.listsRelations = (0, drizzle_orm_1.relations)(exports.lists, ({ one, many }) => ({
    project: one(projects_1.projects, { fields: [exports.lists.projectId], references: [projects_1.projects.id] }),
    space: one(spaces_1.spaces, { fields: [exports.lists.spaceId], references: [spaces_1.spaces.id] }),
    tasks: many(tasks_1.tasks),
}));
//# sourceMappingURL=lists.js.map