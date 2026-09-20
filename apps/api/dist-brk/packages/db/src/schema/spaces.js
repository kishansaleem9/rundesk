"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.spacesRelations = exports.spaces = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const projects_1 = require("./projects");
const users_1 = require("./users");
const enums_1 = require("./enums");
exports.spaces = (0, pg_core_1.pgTable)('spaces', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    color: (0, pg_core_1.text)('color').default('#354fb0'),
    icon: (0, pg_core_1.text)('icon'),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    isArchived: (0, pg_core_1.boolean)('is_archived').notNull().default(false),
    // §13.4 Trash — when the item was deleted and by whom (null = unknown/legacy).
    archivedAt: (0, pg_core_1.timestamp)('archived_at', { withTimezone: true }),
    archivedById: (0, pg_core_1.uuid)('archived_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    visibility: (0, enums_1.containerVisibilityEnum)('visibility').notNull().default('public'),
    // §5 (ClickUp "required views") per-space view config: which of the task
    // views this space's lists expose, and which one opens by default. null =
    // all views enabled + 'list' default.
    viewConfig: (0, pg_core_1.jsonb)('view_config').$type(),
    /**
     * §V2-06, frame `06:52` — "Default permission  Full edit ▾".
     *
     * What a workspace member gets on this space without an explicit grant.
     * Deliberately the same four rungs as `object_shares.level`
     * (view < comment < edit < admin) rather than a second vocabulary: ClickUp's
     * "Full edit" is this ladder's `edit`, and a space that said "Editor" while
     * a share said "edit" would be two words for one thing.
     */
    defaultPermission: (0, pg_core_1.text)('default_permission')
        .$type()
        .notNull()
        .default('edit'),
    /**
     * §V2-06, frame `07:19` — "Enable ClickApps": which of this space's optional
     * features are on. `null` means every one of them, so a space made before
     * this column existed behaves exactly as it did.
     *
     * Only features Rundesk ACTUALLY HAS get a key here. ClickUp's grid includes
     * entries Rundesk has no equivalent for, and a switch that toggles nothing
     * is worse than an absent switch, because the absent one is honest.
     */
    features: (0, pg_core_1.jsonb)('features').$type(),
    /**
     * Which workflow preset made this space (frame `07:06`), or null for one
     * made before presets existed. Kept because `[07:46]` — "yeh LIST
     * automatically generate kar deta hai … us base pe jo aap ne ooper di ho" —
     * means the preset had consequences, and a space with a seeded list and no
     * record of why is a space nobody can explain later.
     */
    presetKey: (0, pg_core_1.text)('preset_key'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
exports.spacesRelations = (0, drizzle_orm_1.relations)(exports.spaces, ({ one, many }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.spaces.workspaceId], references: [workspaces_1.workspaces.id] }),
    projects: many(projects_1.projects),
}));
//# sourceMappingURL=spaces.js.map