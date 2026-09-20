"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.skillConnectionsRelations = exports.skillMemoriesRelations = exports.skillsRelations = exports.skillInstallsRelations = exports.skillInstalls = exports.skillConnections = exports.skillMemories = exports.skills = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
const workspaces_1 = require("./workspaces");
const users_1 = require("./users");
const integration_connections_1 = require("./integration-connections");
/**
 * Skills (§15) — the thing she was most insistent on naming correctly.
 *
 *   "Ab yeh jo SKILL wali cheez hai na… aap jo kaam karte ho woh aap ka AGENT
 *    kar sakta hai" — [17:38], and again at [19:12]: a SKILL, not a feature.
 *
 * A skill is a **named, reusable playbook**: a persona plus instructions that
 * shape the assistant's reply when a person invokes it.
 *
 * That boundary is not our invention, and it is worth being exact because
 * [17:46] ("aap ka AGENT kar sakta hai; aap REPLACE ho sakte ho") sounds like
 * the opposite. In ClickUp these are two different products:
 *
 *   AI Skills — "reusable instructions that allow Brain to load the right
 *   workflow, format, or expertise on demand instead of rewriting the same
 *   prompt every time. Think of a Skill as a saved playbook… you define the
 *   steps, context, and style one time, and Brain follows it every time the
 *   Skill is used."
 *
 *   Autopilot / Super Agents — the layer that ACTS: they "perform actions
 *   based on defined triggers and conditions", run on Lists, Folders, Spaces
 *   and Chat Channels, and are configured with "instructions, triggers,
 *   skills, knowledge, and memory" — where "the Skills section holds all of
 *   your Super Agent's tools".
 *
 * So a Skill is a component an Agent uses, not a small Agent. Her sentence
 * describes the category; the Skills Hub she is demonstrating is the
 * instructions half of it. Building action into this table would not be
 * ambition, it would be the wrong product.
 */
exports.skills = (0, pg_core_1.pgTable)('skills', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    createdById: (0, pg_core_1.uuid)('created_by_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    name: (0, pg_core_1.text)('name').notNull(),
    description: (0, pg_core_1.text)('description'),
    /** The playbook body — folded into the system prompt when the skill is invoked. */
    instructions: (0, pg_core_1.text)('instructions').notNull().default(''),
    /**
     * Which starter card this came from — 'scratch' plus the three prebuilt
     * templates on her carousel (frame 285_1743): Delegate Like Me, Brand
     * Voice, Triage Tasks Like Me. Kept as text, not a pg enum, so adding a
     * template later is a code change rather than an ALTER TYPE migration.
     */
    archetype: (0, pg_core_1.text)('archetype')
        .$type()
        .notNull()
        .default('scratch'),
    /**
     * 'workspace' is what makes her "Discover team skills / Scan my workspace"
     * card mean anything; 'private' is the default so nothing you write is
     * published to colleagues by accident.
     */
    visibility: (0, pg_core_1.text)('visibility').$type().notNull().default('private'),
    /**
     * The author's kill-switch over their own skill, for everyone at once — a
     * disabled skill stays listed but cannot be invoked by anyone.
     *
     * NOT her library's Enabled tab: that is per-person and lives in
     * `skill_installs` below, because "browse, install, and manage" is what a
     * hub does and three tabs over one library need three different scopes.
     */
    enabled: (0, pg_core_1.boolean)('enabled').notNull().default(true),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    // Scoped to the owner, not the workspace: two people may each keep their
    // own "Brand Voice" without one of them losing a name to the other.
    (0, pg_core_1.unique)('uq_skills_ws_owner_name').on(t.workspaceId, t.createdById, t.name),
    (0, pg_core_1.index)('idx_skills_workspace').on(t.workspaceId),
    (0, pg_core_1.index)('idx_skills_ws_owner').on(t.workspaceId, t.createdById),
]);
/**
 * Skill memory — `[18:42]`: "Yeh MEMORY hai — yeh hum jo bhi baat karenge woh
 * STORE karega apne andar."
 *
 * Append-only notes belonging to one skill. Recalled into the system prompt on
 * every invocation, which is what "never explain it again" actually costs.
 */
exports.skillMemories = (0, pg_core_1.pgTable)('skill_memories', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    skillId: (0, pg_core_1.uuid)('skill_id').notNull().references(() => exports.skills.id, { onDelete: 'cascade' }),
    // Denormalised so a workspace can be swept without joining through skills.
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    authorId: (0, pg_core_1.uuid)('author_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    content: (0, pg_core_1.text)('content').notNull(),
    /** 'chat' when captured from a conversation, 'manual' when typed into the skill. */
    source: (0, pg_core_1.text)('source').$type().notNull().default('manual'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [(0, pg_core_1.index)('idx_skill_memories_skill').on(t.skillId, t.createdAt)]);
/**
 * Skill connections — `[18:58]`: "agar main is ko build karoongi to main is ko
 * kisi bhi system mein CONNECT kar sakti hoon."
 *
 * A binding, not a credential. The workspace already holds the OAuth grant in
 * `workspace_integration_connections`; this row records which of those a given
 * skill is allowed to draw on, so the skill inherits access it can never widen
 * and revoking the workspace connection revokes it everywhere at once.
 */
exports.skillConnections = (0, pg_core_1.pgTable)('skill_connections', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    skillId: (0, pg_core_1.uuid)('skill_id').notNull().references(() => exports.skills.id, { onDelete: 'cascade' }),
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    provider: (0, pg_core_1.text)('provider').notNull(),
    /**
     * Nullable on purpose: a skill may name a provider the workspace has not
     * connected yet. That is a connection waiting on an admin, not an error —
     * and it must not vanish when the workspace connection is re-made.
     */
    connectionId: (0, pg_core_1.uuid)('connection_id').references(() => integration_connections_1.workspaceIntegrationConnections.id, {
        onDelete: 'set null',
    }),
    config: (0, pg_core_1.jsonb)('config').$type().notNull().default({}),
    createdById: (0, pg_core_1.uuid)('created_by_id').references(() => users_1.users.id, { onDelete: 'set null' }),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    (0, pg_core_1.unique)('uq_skill_connections_skill_provider').on(t.skillId, t.provider),
    (0, pg_core_1.index)('idx_skill_connections_skill').on(t.skillId),
]);
/**
 * §15 — who has installed a skill.
 *
 * ClickUp's Skills Hub is where you "browse, INSTALL, and manage" skills, and
 * her library tabs are All Skills / Enabled / Created by me (frame `285_1743`).
 * Three tabs over one library only mean three different things if Enabled is
 * per-person: otherwise it is a filter on a flag the author controls, which
 * would sit oddly next to "Created by me".
 *
 * So installing is a row here, not a column on the skill. The author's
 * `skills.enabled` stays what it is — a kill-switch over their own skill for
 * everyone — and this records who chose to pick it up.
 */
exports.skillInstalls = (0, pg_core_1.pgTable)('skill_installs', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    skillId: (0, pg_core_1.uuid)('skill_id').notNull().references(() => exports.skills.id, { onDelete: 'cascade' }),
    // Denormalised so "what has this person installed" is one indexed read.
    workspaceId: (0, pg_core_1.uuid)('workspace_id').notNull().references(() => workspaces_1.workspaces.id, { onDelete: 'cascade' }),
    userId: (0, pg_core_1.uuid)('user_id').notNull().references(() => users_1.users.id, { onDelete: 'cascade' }),
    installedAt: (0, pg_core_1.timestamp)('installed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    // Installing twice is the same as installing once.
    (0, pg_core_1.unique)('uq_skill_installs_skill_user').on(t.skillId, t.userId),
    (0, pg_core_1.index)('idx_skill_installs_user_ws').on(t.userId, t.workspaceId),
]);
exports.skillInstallsRelations = (0, drizzle_orm_1.relations)(exports.skillInstalls, ({ one }) => ({
    skill: one(exports.skills, { fields: [exports.skillInstalls.skillId], references: [exports.skills.id] }),
    workspace: one(workspaces_1.workspaces, { fields: [exports.skillInstalls.workspaceId], references: [workspaces_1.workspaces.id] }),
    user: one(users_1.users, { fields: [exports.skillInstalls.userId], references: [users_1.users.id] }),
}));
exports.skillsRelations = (0, drizzle_orm_1.relations)(exports.skills, ({ one, many }) => ({
    workspace: one(workspaces_1.workspaces, { fields: [exports.skills.workspaceId], references: [workspaces_1.workspaces.id] }),
    createdBy: one(users_1.users, { fields: [exports.skills.createdById], references: [users_1.users.id] }),
    memories: many(exports.skillMemories),
    connections: many(exports.skillConnections),
    installs: many(exports.skillInstalls),
}));
exports.skillMemoriesRelations = (0, drizzle_orm_1.relations)(exports.skillMemories, ({ one }) => ({
    skill: one(exports.skills, { fields: [exports.skillMemories.skillId], references: [exports.skills.id] }),
    workspace: one(workspaces_1.workspaces, { fields: [exports.skillMemories.workspaceId], references: [workspaces_1.workspaces.id] }),
    author: one(users_1.users, { fields: [exports.skillMemories.authorId], references: [users_1.users.id] }),
}));
exports.skillConnectionsRelations = (0, drizzle_orm_1.relations)(exports.skillConnections, ({ one }) => ({
    skill: one(exports.skills, { fields: [exports.skillConnections.skillId], references: [exports.skills.id] }),
    workspace: one(workspaces_1.workspaces, { fields: [exports.skillConnections.workspaceId], references: [workspaces_1.workspaces.id] }),
    connection: one(integration_connections_1.workspaceIntegrationConnections, {
        fields: [exports.skillConnections.connectionId],
        references: [integration_connections_1.workspaceIntegrationConnections.id],
    }),
    createdBy: one(users_1.users, { fields: [exports.skillConnections.createdById], references: [users_1.users.id] }),
}));
//# sourceMappingURL=skills.js.map