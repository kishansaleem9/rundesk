import { pgTable, text, timestamp, uuid, jsonb, boolean, integer, index, uniqueIndex, primaryKey, check } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { workspaces } from './workspaces'
import { users } from './users'

/**
 * SUPER AGENTS, as ClickUp has them (`commit-log/log-214dac0-1`, `ledger-rows/row-852`).
 *
 * An agent that ACTS, where a Skill (`skills.ts`) is the playbook one follows:
 * a profile of Instructions, Triggers, Skills (its tools), Knowledge and Memory,
 * started by an @mention, a direct message, an assignment, a schedule or an
 * Automation, and answering where it was asked — a threaded comment, a reply in
 * Chat, its DM. Each one is a member of its workspace through its own account
 * (`users.is_agent`), so it is mentioned, assigned and messaged like a person.
 */
export type SuperAgentTrigger = { on: boolean; instructions?: string }
export type SuperAgentSchedule = SuperAgentTrigger & {
  every: 'hourly' | 'daily' | 'weekly' | 'monthly'
  /** `HH:MM`, the workspace's clock, for daily and longer. */
  at?: string
  /** 0 (Sunday) to 6, for weekly. */
  weekday?: number
  /** 1 to 28, for monthly. */
  day?: number
  /** When it was last set: a slot before this is not owed, so a new schedule never runs at once for a time already gone. */
  since?: string
}
export type SuperAgentTriggers = {
  mention: SuperAgentTrigger
  dm: SuperAgentTrigger
  assign: SuperAgentTrigger
  schedule: SuperAgentSchedule
}
export type SuperAgentKnowledge = {
  /** Where it may read: spaces, folders or lists of its workspace. None means everything its reader may read. */
  locations: Array<{ kind: 'space' | 'project' | 'list'; id: string }>
  /** Rundesk's help pages, as ClickUp's agents may read its help articles. */
  help: boolean
}

export const superAgents = pgTable(
  'super_agents',
  {
    id:           uuid('id').primaryKey().defaultRandom(),
    workspaceId:  uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    /** Its own account: what it is mentioned, assigned and messaged as, and answers as. */
    userId:       uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name:         text('name').notNull(),
    description:  text('description').notNull().default(''),
    avatarColor:  text('avatar_color').notNull().default('#7c3aed'),
    instructions: text('instructions').notNull().default(''),
    /** Its tools, by the AI command tools' names (`ai-command.ts`). */
    skills:       text('skills').array().notNull().default(sql`'{}'::text[]`),
    knowledge:    jsonb('knowledge').$type<SuperAgentKnowledge>().notNull().default(sql`'{"locations":[],"help":false}'::jsonb`),
    triggers:     jsonb('triggers').$type<SuperAgentTriggers>().notNull(),
    /** Private: its maker and the people it is shared with, and nobody else, may see or use it. */
    isPrivate:    boolean('is_private').notNull().default(false),
    /** Deactivated: kept with its history, started by nothing. */
    isActive:     boolean('is_active').notNull().default(true),
    createdById:  uuid('created_by_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byWorkspace: index('super_agents_workspace_idx').on(t.workspaceId),
    byUser:      uniqueIndex('super_agents_user_unique').on(t.userId),
  }),
)

/** Who a private agent is shared with (its maker always may). */
export const superAgentAccess = pgTable(
  'super_agent_access',
  {
    agentId: uuid('agent_id').notNull().references(() => superAgents.id, { onDelete: 'cascade' }),
    userId:  uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.agentId, t.userId] }) }),
)

/**
 * What it remembers (ClickUp's three kinds): `recent` — its own recent work;
 * `preference` — what somebody asked it to remember, kept once approved;
 * `intelligence` — what it chose to keep.
 */
export const superAgentMemories = pgTable(
  'super_agent_memories',
  {
    id:          uuid('id').primaryKey().defaultRandom(),
    agentId:     uuid('agent_id').notNull().references(() => superAgents.id, { onDelete: 'cascade' }),
    kind:        text('kind').$type<'recent' | 'preference' | 'intelligence'>().notNull(),
    content:     text('content').notNull(),
    approved:    boolean('approved').notNull().default(true),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byAgent: index('super_agent_memories_agent_idx').on(t.agentId, t.createdAt),
    kindCheck: check('super_agent_memories_kind_check', sql`${t.kind} IN ('recent', 'preference', 'intelligence')`),
  }),
)

/** Every run, as ClickUp's Activity lists them: when, which agent, what started it, who, and how it ended. */
export const superAgentRuns = pgTable(
  'super_agent_runs',
  {
    id:            uuid('id').primaryKey().defaultRandom(),
    agentId:       uuid('agent_id').notNull().references(() => superAgents.id, { onDelete: 'cascade' }),
    workspaceId:   uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    trigger:       text('trigger').$type<'mention' | 'dm' | 'assign' | 'schedule' | 'automation' | 'manual'>().notNull(),
    status:        text('status').$type<'running' | 'completed' | 'failed' | 'skipped'>().notNull().default('running'),
    /** Who started it; nobody for a schedule. */
    triggeredById: uuid('triggered_by_id').references(() => users.id, { onDelete: 'set null' }),
    /** Where it was asked and answered: a task (its comment), a channel, its DM. */
    location:      jsonb('location').$type<{ kind: 'task' | 'channel' | 'dm' | 'profile'; id: string; title?: string }>(),
    input:         text('input').notNull().default(''),
    output:        text('output'),
    error:         text('error'),
    /**
     * What it did: the actions of its turn that were carried out — a task
     * made, a field set — and not the ones refused or skipped (migration 0193).
     * ClickUp's Agent Performance counts an agent's work in these.
     */
    actionsCompleted: integer('actions_completed').notNull().default(0),
    startedAt:     timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt:    timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    byWorkspace: index('super_agent_runs_workspace_idx').on(t.workspaceId, t.startedAt),
    byAgent:     index('super_agent_runs_agent_idx').on(t.agentId, t.startedAt),
    triggerCheck: check('super_agent_runs_trigger_check', sql`${t.trigger} IN ('mention', 'dm', 'assign', 'schedule', 'automation', 'manual')`),
    statusCheck:  check('super_agent_runs_status_check', sql`${t.status} IN ('running', 'completed', 'failed', 'skipped')`),
    actionsCheck: check('super_agent_runs_actions_check', sql`${t.actionsCompleted} >= 0`),
  }),
)

export const superAgentsRelations = relations(superAgents, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [superAgents.workspaceId], references: [workspaces.id] }),
  user:      one(users, { fields: [superAgents.userId], references: [users.id] }),
  memories:  many(superAgentMemories),
  runs:      many(superAgentRuns),
}))
