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
 * shape the assistant's reply when a person invokes it. ClickUp's own copy is
 * the same shape — "turn a repetitive workflow into a skill that Brain reuses,
 * so you never explain it again" — reuse of an explanation, not delegation of
 * authority.
 *
 * Deliberate boundary: a skill does **not** act unattended. Nothing in the
 * video shows a skill running on its own — every frame is a person asking and
 * the assistant answering, right down to the approval gate at [18:58]
 * ("Approve this approach and I'll create it"). Giving a stored row the power
 * to act would be inventing an authority nobody granted. When that authority
 * is wanted it should be granted explicitly, on a surface built for it.
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
    /** Her library's Enabled tab. A disabled skill stays listed but cannot be invoked. */
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

export const skillsRelations = relations(skills, ({ one, many }) => ({
  workspace:   one(workspaces, { fields: [skills.workspaceId], references: [workspaces.id] }),
  createdBy:   one(users, { fields: [skills.createdById], references: [users.id] }),
  memories:    many(skillMemories),
  connections: many(skillConnections),
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
