import { pgTable, text, timestamp, uuid, jsonb, boolean, unique, index } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'
import { workspaceIntegrationConnections } from './integration-connections'

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
export const skills = pgTable(
  'skills',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    createdById: uuid('created_by_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name:        text('name').notNull(),
    description: text('description'),
    /** The playbook body — folded into the system prompt when the skill is invoked. */
    instructions: text('instructions').notNull().default(''),
    /**
     * Which starter card this came from — 'scratch' plus the three prebuilt
     * templates on her carousel (frame 285_1743): Delegate Like Me, Brand
     * Voice, Triage Tasks Like Me. Kept as text, not a pg enum, so adding a
     * template later is a code change rather than an ALTER TYPE migration.
     */
    archetype:   text('archetype')
      .$type<'scratch' | 'delegate_like_me' | 'brand_voice' | 'triage_like_me'>()
      .notNull()
      .default('scratch'),
    /**
     * 'workspace' is what makes her "Discover team skills / Scan my workspace"
     * card mean anything; 'private' is the default so nothing you write is
     * published to colleagues by accident.
     */
    visibility:  text('visibility').$type<'private' | 'workspace'>().notNull().default('private'),
    /**
     * The author's kill-switch over their own skill, for everyone at once — a
     * disabled skill stays listed but cannot be invoked by anyone.
     *
     * NOT her library's Enabled tab: that is per-person and lives in
     * `skill_installs` below, because "browse, install, and manage" is what a
     * hub does and three tabs over one library need three different scopes.
     */
    enabled:     boolean('enabled').notNull().default(true),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Scoped to the owner, not the workspace: two people may each keep their
    // own "Brand Voice" without one of them losing a name to the other.
    unique('uq_skills_ws_owner_name').on(t.workspaceId, t.createdById, t.name),
    index('idx_skills_workspace').on(t.workspaceId),
    index('idx_skills_ws_owner').on(t.workspaceId, t.createdById),
  ],
)

/**
 * Skill memory — `[18:42]`: "Yeh MEMORY hai — yeh hum jo bhi baat karenge woh
 * STORE karega apne andar."
 *
 * Append-only notes belonging to one skill. Recalled into the system prompt on
 * every invocation, which is what "never explain it again" actually costs.
 */
export const skillMemories = pgTable(
  'skill_memories',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    skillId:     uuid('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
    // Denormalised so a workspace can be swept without joining through skills.
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    authorId:    uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    content:     text('content').notNull(),
    /** 'chat' when captured from a conversation, 'manual' when typed into the skill. */
    source:      text('source').$type<'chat' | 'manual'>().notNull().default('manual'),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_skill_memories_skill').on(t.skillId, t.createdAt)],
)

/**
 * Skill connections — `[18:58]`: "agar main is ko build karoongi to main is ko
 * kisi bhi system mein CONNECT kar sakti hoon."
 *
 * A binding, not a credential. The workspace already holds the OAuth grant in
 * `workspace_integration_connections`; this row records which of those a given
 * skill is allowed to draw on, so the skill inherits access it can never widen
 * and revoking the workspace connection revokes it everywhere at once.
 */
export const skillConnections = pgTable(
  'skill_connections',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    skillId:     uuid('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    provider:    text('provider').notNull(),
    /**
     * Nullable on purpose: a skill may name a provider the workspace has not
     * connected yet. That is a connection waiting on an admin, not an error —
     * and it must not vanish when the workspace connection is re-made.
     */
    connectionId: uuid('connection_id').references(() => workspaceIntegrationConnections.id, {
      onDelete: 'set null',
    }),
    config:      jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_skill_connections_skill_provider').on(t.skillId, t.provider),
    index('idx_skill_connections_skill').on(t.skillId),
  ],
)

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
export const skillInstalls = pgTable(
  'skill_installs',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    skillId:     uuid('skill_id').notNull().references(() => skills.id, { onDelete: 'cascade' }),
    // Denormalised so "what has this person installed" is one indexed read.
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    installedAt: timestamp('installed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Installing twice is the same as installing once.
    unique('uq_skill_installs_skill_user').on(t.skillId, t.userId),
    index('idx_skill_installs_user_ws').on(t.userId, t.workspaceId),
  ],
)

export const skillInstallsRelations = relations(skillInstalls, ({ one }) => ({
  skill:     one(skills, { fields: [skillInstalls.skillId], references: [skills.id] }),
  workspace: one(workspaces, { fields: [skillInstalls.workspaceId], references: [workspaces.id] }),
  user:      one(users, { fields: [skillInstalls.userId], references: [users.id] }),
}))

export const skillsRelations = relations(skills, ({ one, many }) => ({
  workspace:   one(workspaces, { fields: [skills.workspaceId], references: [workspaces.id] }),
  createdBy:   one(users, { fields: [skills.createdById], references: [users.id] }),
  memories:    many(skillMemories),
  connections: many(skillConnections),
  installs:    many(skillInstalls),
}))

export const skillMemoriesRelations = relations(skillMemories, ({ one }) => ({
  skill:     one(skills, { fields: [skillMemories.skillId], references: [skills.id] }),
  workspace: one(workspaces, { fields: [skillMemories.workspaceId], references: [workspaces.id] }),
  author:    one(users, { fields: [skillMemories.authorId], references: [users.id] }),
}))

export const skillConnectionsRelations = relations(skillConnections, ({ one }) => ({
  skill:      one(skills, { fields: [skillConnections.skillId], references: [skills.id] }),
  workspace:  one(workspaces, { fields: [skillConnections.workspaceId], references: [workspaces.id] }),
  connection: one(workspaceIntegrationConnections, {
    fields: [skillConnections.connectionId],
    references: [workspaceIntegrationConnections.id],
  }),
  createdBy:  one(users, { fields: [skillConnections.createdById], references: [users.id] }),
}))
