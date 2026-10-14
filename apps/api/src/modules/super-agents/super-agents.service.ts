import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, exists, gte, inArray, lte, or, sql, type SQL } from 'drizzle-orm'
import {
  lists,
  projects,
  spaces,
  superAgentAccess,
  superAgentMemories,
  superAgentRuns,
  superAgents,
  users,
  workspaceMembers,
  workspaces,
  type SuperAgentKnowledge,
  type SuperAgentTriggers,
} from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { isWorkspaceManager } from '../../common/permissions/container-access.guard-helper'
import { isUuid } from '../../common/validation/uuid'
import { creditMonth } from '../ai/credits'
import { summariseAgent } from '../ai/ai-value'

/**
 * The tools a Super Agent may be given — its Skills — by the command
 * assistant's own tool names (`ai-command.ts`), so an agent's action is the
 * assistant's action, checked the same way. New agents start with ClickUp's
 * "Default tools": finding work and making it.
 */
export const AGENT_SKILLS = ['search_tasks', 'create_task', 'set_task_status', 'reschedule_task', 'assign_task', 'bulk_reschedule'] as const
export type AgentSkill = (typeof AGENT_SKILLS)[number]
export const DEFAULT_SKILLS: AgentSkill[] = ['search_tasks', 'create_task']

export const DEFAULT_TRIGGERS: SuperAgentTriggers = {
  mention: { on: true },
  dm: { on: true },
  assign: { on: true },
  schedule: { on: false, every: 'daily', at: '09:00' },
}
const SCHEDULE_EVERY = ['hourly', 'daily', 'weekly', 'monthly'] as const
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/
const COLOR = /^#[0-9a-fA-F]{6}$/

export type AgentInput = {
  name?: unknown
  description?: unknown
  avatarColor?: unknown
  instructions?: unknown
  skills?: unknown
  knowledge?: unknown
  triggers?: unknown
  isActive?: unknown
}

type Actor = { id: string }

/**
 * SUPER AGENTS: THEIR PROFILES, WHO MAY SEE AND CHANGE THEM, WHAT THEY REMEMBER,
 * AND THEIR ACTIVITY (`commit-log/log-214dac0-1`, `ledger-rows/row-852`).
 *
 * As ClickUp keeps them: a profile of Instructions, Triggers, Skills, Knowledge
 * and Memory; public to the workspace unless made private, when its maker and
 * the people it is shared with alone may see or use it; changed, shared,
 * switched off or deleted by its maker or a workspace admin; and out of reach
 * of guests altogether. Running one is `SuperAgentsRunner`'s.
 */
@Injectable()
export class SuperAgentsService {
  constructor(@Inject(DB_TOKEN) private readonly db: Db) {}

  /** The reader's place in the workspace: a member who is not a guest, or a refusal in words. */
  async assertMayUseAgents(workspaceId: string, userId: string): Promise<{ isManager: boolean }> {
    const [row] = await this.db
      .select({ role: workspaceMembers.role, isAgent: users.isAgent })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!row) throw new ForbiddenException('You are not a member of this workspace')
    if (row.role === 'guest') throw new ForbiddenException('Guests have no Super Agents')
    if (row.isAgent) throw new ForbiddenException('An agent cannot make or change agents')
    return { isManager: await isWorkspaceManager(this.db, workspaceId, userId) }
  }

  /** Which agents a person may see: the public ones, theirs, and the private ones shared with them. */
  visibleTo(userId: string): SQL {
    return or(
      eq(superAgents.isPrivate, false),
      eq(superAgents.createdById, userId),
      exists(
        this.db
          .select({ one: sql`1` })
          .from(superAgentAccess)
          .where(and(eq(superAgentAccess.agentId, superAgents.id), eq(superAgentAccess.userId, userId))),
      ),
    ) as SQL
  }

  async list(workspaceId: string, actor: Actor, opts: { mine?: boolean } = {}) {
    await this.assertMayUseAgents(workspaceId, actor.id)
    const rows = await this.db
      .select({
        id: superAgents.id,
        userId: superAgents.userId,
        name: superAgents.name,
        description: superAgents.description,
        avatarColor: superAgents.avatarColor,
        isPrivate: superAgents.isPrivate,
        isActive: superAgents.isActive,
        skills: superAgents.skills,
        triggers: superAgents.triggers,
        createdById: superAgents.createdById,
        createdByName: users.displayName,
        updatedAt: superAgents.updatedAt,
        lastRunAt: sql<string | null>`(select max(r.started_at) from super_agent_runs r where r.agent_id = ${superAgents.id})`,
      })
      .from(superAgents)
      .innerJoin(users, eq(users.id, superAgents.createdById))
      .where(
        and(
          eq(superAgents.workspaceId, workspaceId),
          this.visibleTo(actor.id),
          opts.mine ? eq(superAgents.createdById, actor.id) : undefined,
        ),
      )
      .orderBy(desc(superAgents.updatedAt))
    return rows
  }

  /** One agent as its profile shows it, with what this reader may do to it. */
  async get(id: string, actor: Actor) {
    const agent = await this.findVisible(id, actor)
    const { isManager } = await this.assertMayUseAgents(agent.workspaceId, actor.id)
    const mayManage = agent.createdById === actor.id || isManager
    const access = mayManage
      ? await this.db
          .select({ userId: superAgentAccess.userId, displayName: users.displayName, email: users.email })
          .from(superAgentAccess)
          .innerJoin(users, eq(users.id, superAgentAccess.userId))
          .where(eq(superAgentAccess.agentId, agent.id))
      : []
    return { ...agent, mayManage, access }
  }

  /** The agent, if this reader may see it; not found otherwise, as an agent they may not see is no agent to them. */
  async findVisible(id: string, actor: Actor) {
    if (!isUuid(id)) throw new NotFoundException('Super Agent not found')
    const [agent] = await this.db
      .select()
      .from(superAgents)
      .where(and(eq(superAgents.id, id), this.visibleTo(actor.id)))
      .limit(1)
    if (!agent) throw new NotFoundException('Super Agent not found')
    return agent
  }

  private async findManaged(id: string, actor: Actor) {
    const agent = await this.findVisible(id, actor)
    const { isManager } = await this.assertMayUseAgents(agent.workspaceId, actor.id)
    if (agent.createdById !== actor.id && !isManager) {
      throw new ForbiddenException('Only its maker or a workspace admin may change this Super Agent')
    }
    return agent
  }

  async create(workspaceId: string, actor: Actor, input: AgentInput) {
    await this.assertMayUseAgents(workspaceId, actor.id)
    const fields = await this.validate(workspaceId, input, true)
    const id = await this.db.transaction(async (tx) => {
      // Its own account: what it is mentioned, assigned and messaged as. No password, so it never signs in.
      const [account] = await tx
        .insert(users)
        .values({
          email: `agent-${randomUUID()}@agents.rundesk.invalid`,
          displayName: fields.name as string,
          isAgent: true,
          emailVerified: true,
        })
        .returning({ id: users.id })
      await tx.insert(workspaceMembers).values({ workspaceId, userId: account.id, role: 'member' })
      const [agent] = await tx
        .insert(superAgents)
        .values({
          workspaceId,
          userId: account.id,
          name: fields.name as string,
          description: (fields.description as string | undefined) ?? '',
          avatarColor: (fields.avatarColor as string | undefined) ?? '#7c3aed',
          instructions: (fields.instructions as string | undefined) ?? '',
          skills: (fields.skills as string[] | undefined) ?? [...DEFAULT_SKILLS],
          knowledge: (fields.knowledge as SuperAgentKnowledge | undefined) ?? { locations: [], help: false },
          triggers: (fields.triggers as SuperAgentTriggers | undefined) ?? DEFAULT_TRIGGERS,
          isActive: (fields.isActive as boolean | undefined) ?? true,
          createdById: actor.id,
        })
        .returning({ id: superAgents.id })
      return agent.id
    })
    return this.get(id, actor)
  }

  async update(id: string, actor: Actor, input: AgentInput) {
    const agent = await this.findManaged(id, actor)
    const fields = await this.validate(agent.workspaceId, input, false)
    if (Object.keys(fields).length === 0) return this.get(id, actor)
    await this.db.transaction(async (tx) => {
      await tx
        .update(superAgents)
        .set({ ...(fields as Partial<typeof superAgents.$inferInsert>), updatedAt: new Date() })
        .where(eq(superAgents.id, agent.id))
      // Its name is what it is mentioned and seen as everywhere it answers.
      if (typeof fields.name === 'string') await tx.update(users).set({ displayName: fields.name }).where(eq(users.id, agent.userId))
    })
    return this.get(id, actor)
  }

  /**
   * Deleted: its profile, memory and runs go; its account stays, switched off
   * and out of the workspace, so the comments and messages it wrote keep their
   * author. ClickUp keeps a deactivated agent's history; a deleted one is gone.
   */
  async remove(id: string, actor: Actor) {
    const agent = await this.findManaged(id, actor)
    await this.db.transaction(async (tx) => {
      await tx.delete(superAgents).where(eq(superAgents.id, agent.id))
      await tx.update(users).set({ isActive: false }).where(eq(users.id, agent.userId))
      await tx
        .delete(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, agent.workspaceId), eq(workspaceMembers.userId, agent.userId)))
    })
    return { deleted: true }
  }

  /** A copy, made by whoever clones it and theirs: its profile, not its memory or its runs. */
  async clone(id: string, actor: Actor) {
    const agent = await this.findVisible(id, actor)
    return this.create(agent.workspaceId, actor, {
      name: `${agent.name} (copy)`.slice(0, 60),
      description: agent.description,
      avatarColor: agent.avatarColor,
      instructions: agent.instructions,
      skills: agent.skills,
      knowledge: agent.knowledge,
      triggers: agent.triggers,
      isActive: agent.isActive,
    })
  }

  /** Public, or private to its maker and the people named — members of its workspace who are not guests. */
  async setAccess(id: string, actor: Actor, input: { isPrivate?: unknown; userIds?: unknown }) {
    const agent = await this.findManaged(id, actor)
    const isPrivate = input.isPrivate === undefined ? agent.isPrivate : input.isPrivate === true
    const userIds = Array.isArray(input.userIds) ? [...new Set(input.userIds.filter((u): u is string => typeof u === 'string'))] : []
    if (userIds.some((u) => !isUuid(u))) throw new BadRequestException('Share with people by their ids')
    if (userIds.length) {
      const members = await this.db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(
          and(
            eq(workspaceMembers.workspaceId, agent.workspaceId),
            inArray(workspaceMembers.userId, userIds),
            sql`${workspaceMembers.role} <> 'guest'`,
            eq(users.isAgent, false),
          ),
        )
      const found = new Set(members.map((m) => m.userId))
      const outside = userIds.filter((u) => !found.has(u))
      if (outside.length) throw new BadRequestException('A Super Agent is shared only with members of its workspace who are not guests')
    }
    await this.db.transaction(async (tx) => {
      await tx.update(superAgents).set({ isPrivate, updatedAt: new Date() }).where(eq(superAgents.id, agent.id))
      await tx.delete(superAgentAccess).where(eq(superAgentAccess.agentId, agent.id))
      if (isPrivate && userIds.length) {
        await tx.insert(superAgentAccess).values(userIds.map((userId) => ({ agentId: agent.id, userId }))).onConflictDoNothing()
      }
    })
    return this.get(id, actor)
  }

  async memories(id: string, actor: Actor) {
    const agent = await this.findVisible(id, actor)
    await this.assertMayUseAgents(agent.workspaceId, actor.id)
    return this.db
      .select({
        id: superAgentMemories.id,
        kind: superAgentMemories.kind,
        content: superAgentMemories.content,
        approved: superAgentMemories.approved,
        createdAt: superAgentMemories.createdAt,
      })
      .from(superAgentMemories)
      .where(eq(superAgentMemories.agentId, agent.id))
      .orderBy(desc(superAgentMemories.createdAt))
      .limit(200)
  }

  /** A preference it was asked to keep is kept once its maker or an admin approves it, as ClickUp asks first. */
  async approveMemory(id: string, memoryId: string, actor: Actor) {
    const agent = await this.findManaged(id, actor)
    if (!isUuid(memoryId)) throw new NotFoundException('Memory not found')
    const [row] = await this.db
      .update(superAgentMemories)
      .set({ approved: true })
      .where(and(eq(superAgentMemories.id, memoryId), eq(superAgentMemories.agentId, agent.id)))
      .returning({ id: superAgentMemories.id })
    if (!row) throw new NotFoundException('Memory not found')
    return { approved: true }
  }

  async forgetMemory(id: string, memoryId: string, actor: Actor) {
    const agent = await this.findManaged(id, actor)
    if (!isUuid(memoryId)) throw new NotFoundException('Memory not found')
    const gone = await this.db
      .delete(superAgentMemories)
      .where(and(eq(superAgentMemories.id, memoryId), eq(superAgentMemories.agentId, agent.id)))
      .returning({ id: superAgentMemories.id })
    if (!gone.length) throw new NotFoundException('Memory not found')
    return { deleted: true }
  }

  /**
   * ACTIVITY, as ClickUp's: every run of the agents this reader may see, newest
   * first, each with its time, its agent, what started it, who did, where, and
   * how it ended — filtered by status, "My agents", one agent, and dates.
   */
  /**
   * MY AGENT PERFORMANCE, as ClickUp's Credits tab draws it
   * (`found-14-oct/agent-performance-carried-and-unbuilt`): this month, a row
   * per Super Agent — its runs, the actions it carried out, the time they
   * saved at the workspace's minutes per action, what that time was worth at
   * its hourly rate, what the agent cost in credits (its own runs' calls,
   * `ai_usage.agent_run_id`), and the return. Workspace admins read every
   * agent of the workspace; a member, the ones they made; a guest, none.
   */
  async performance(workspaceId: string, actor: Actor, now: Date = new Date()) {
    const { isManager } = await this.assertMayUseAgents(workspaceId, actor.id)
    const since = creditMonth(now).start.toISOString()
    const [ws] = await this.db
      .select({ perAction: workspaces.aiMinutesSavedPerAgentAction, rate: workspaces.aiHourlyRateCents })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)
    if (!ws) throw new NotFoundException('Workspace not found')
    const benchmark = { minutesSavedPerAction: ws.perAction, hourlyRateCents: ws.rate }
    const rows = await this.db
      .select({
        id: superAgents.id,
        name: superAgents.name,
        avatarColor: superAgents.avatarColor,
        isActive: superAgents.isActive,
        createdById: superAgents.createdById,
        createdByName: users.displayName,
        // A run refused before it began (switched off, not started by that) did nothing and is not counted.
        runs: sql<number>`(select count(*)::int from super_agent_runs r where r.agent_id = ${superAgents.id} and r.status <> 'skipped' and r.started_at >= ${since}::timestamptz)`,
        actions: sql<number>`(select coalesce(sum(r.actions_completed), 0)::int from super_agent_runs r where r.agent_id = ${superAgents.id} and r.started_at >= ${since}::timestamptz)`,
        credits: sql<number>`(select coalesce(sum(u.credits), 0)::int from ai_usage u join super_agent_runs r on r.id = u.agent_run_id where r.agent_id = ${superAgents.id} and u.created_at >= ${since}::timestamptz)`,
      })
      .from(superAgents)
      .innerJoin(users, eq(users.id, superAgents.createdById))
      .where(and(eq(superAgents.workspaceId, workspaceId), isManager ? undefined : eq(superAgents.createdById, actor.id)))
      .orderBy(asc(superAgents.name))
    return {
      scope: isManager ? ('all' as const) : ('mine' as const),
      monthStart: since,
      benchmark,
      mayEditBenchmark: isManager,
      agents: rows.map((r) => ({
        id: r.id,
        name: r.name,
        avatarColor: r.avatarColor,
        isActive: r.isActive,
        createdBy: { id: r.createdById, name: r.createdByName },
        runs: r.runs,
        ...summariseAgent(r.actions, r.credits, benchmark),
      })),
    }
  }

  async activity(
    workspaceId: string,
    actor: Actor,
    opts: { status?: string; mine?: boolean; agentId?: string; from?: string; to?: string; limit?: number } = {},
  ) {
    await this.assertMayUseAgents(workspaceId, actor.id)
    const statuses = ['running', 'completed', 'failed', 'skipped']
    if (opts.status && !statuses.includes(opts.status)) throw new BadRequestException('status is completed, failed, skipped or running')
    if (opts.agentId && !isUuid(opts.agentId)) throw new BadRequestException('agentId is an agent’s id')
    const day = (v?: string) => {
      if (!v) return null
      const d = new Date(v)
      if (Number.isNaN(d.getTime())) throw new BadRequestException('from and to are dates')
      return d
    }
    const from = day(opts.from)
    const to = day(opts.to)
    const triggeredBy = sql<string | null>`(select u.display_name from users u where u.id = ${superAgentRuns.triggeredById})`
    return this.db
      .select({
        id: superAgentRuns.id,
        agentId: superAgentRuns.agentId,
        agentName: superAgents.name,
        trigger: superAgentRuns.trigger,
        status: superAgentRuns.status,
        triggeredById: superAgentRuns.triggeredById,
        triggeredByName: triggeredBy,
        location: superAgentRuns.location,
        input: superAgentRuns.input,
        output: superAgentRuns.output,
        error: superAgentRuns.error,
        startedAt: superAgentRuns.startedAt,
        finishedAt: superAgentRuns.finishedAt,
      })
      .from(superAgentRuns)
      .innerJoin(superAgents, eq(superAgents.id, superAgentRuns.agentId))
      .where(
        and(
          eq(superAgentRuns.workspaceId, workspaceId),
          this.visibleTo(actor.id),
          opts.status ? eq(superAgentRuns.status, opts.status as 'completed') : undefined,
          opts.mine ? eq(superAgents.createdById, actor.id) : undefined,
          opts.agentId ? eq(superAgentRuns.agentId, opts.agentId) : undefined,
          from ? gte(superAgentRuns.startedAt, from) : undefined,
          to ? lte(superAgentRuns.startedAt, to) : undefined,
        ),
      )
      .orderBy(desc(superAgentRuns.startedAt))
      .limit(Math.min(Math.max(opts.limit ?? 100, 1), 200))
  }

  /** The agent whose account this is, for the moments that start one. */
  async byAccount(userId: string) {
    const [agent] = await this.db.select().from(superAgents).where(eq(superAgents.userId, userId)).limit(1)
    return agent ?? null
  }

  /** May this person start this agent: a member of its workspace who is not a guest, and one it is visible to. */
  async mayUse(agent: typeof superAgents.$inferSelect, userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ role: workspaceMembers.role, isAgent: users.isAgent })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(eq(workspaceMembers.workspaceId, agent.workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    if (!row || row.role === 'guest' || row.isAgent) return false
    if (!agent.isPrivate || agent.createdById === userId) return true
    const [shared] = await this.db
      .select({ userId: superAgentAccess.userId })
      .from(superAgentAccess)
      .where(and(eq(superAgentAccess.agentId, agent.id), eq(superAgentAccess.userId, userId)))
      .limit(1)
    return !!shared
  }

  /**
   * The builder's draft, made into a profile the form can show: what the model
   * wrote is kept where it is one of the profile's own values, and replaced by
   * the default where it is not — a draft is never refused, it is the person
   * who keeps or changes it before it is made.
   */
  draftFrom(_workspaceId: string, draft: Record<string, unknown>) {
    const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
    const offered = new Set<string>(AGENT_SKILLS)
    const skills = Array.isArray(draft.skills) ? [...new Set(draft.skills.filter((k): k is string => typeof k === 'string' && offered.has(k)))] : []
    let triggers: SuperAgentTriggers
    try {
      triggers = this.validTriggers(draft.triggers)
    } catch {
      triggers = DEFAULT_TRIGGERS
    }
    const { since: _since, ...schedule } = triggers.schedule
    return {
      name: text(draft.name, 60) || 'New Super Agent',
      description: text(draft.description, 500),
      instructions: text(draft.instructions, 8000),
      skills: skills.length ? skills : [...DEFAULT_SKILLS],
      triggers: { ...triggers, schedule },
    }
  }

  /** What may be written to a profile, checked field by field; a create needs a name. */
  async validate(workspaceId: string, input: AgentInput, creating: boolean): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {}
    if (input.name !== undefined || creating) {
      const name = typeof input.name === 'string' ? input.name.trim() : ''
      if (!name) throw new BadRequestException('A Super Agent needs a name')
      if (name.length > 60) throw new BadRequestException('A name is at most 60 characters')
      out.name = name
    }
    if (input.description !== undefined) {
      if (typeof input.description !== 'string' || input.description.length > 500) throw new BadRequestException('A description is text of at most 500 characters')
      out.description = input.description.trim()
    }
    if (input.avatarColor !== undefined) {
      if (typeof input.avatarColor !== 'string' || !COLOR.test(input.avatarColor)) throw new BadRequestException('A colour is #rrggbb')
      out.avatarColor = input.avatarColor
    }
    if (input.instructions !== undefined) {
      if (typeof input.instructions !== 'string' || input.instructions.length > 8000) throw new BadRequestException('Instructions are text of at most 8000 characters')
      out.instructions = input.instructions
    }
    if (input.isActive !== undefined) {
      if (typeof input.isActive !== 'boolean') throw new BadRequestException('isActive is true or false')
      out.isActive = input.isActive
    }
    if (input.skills !== undefined) {
      if (!Array.isArray(input.skills) || input.skills.some((s) => typeof s !== 'string')) throw new BadRequestException('Skills are a list of tool names')
      const unknown = input.skills.filter((s) => !(AGENT_SKILLS as readonly string[]).includes(s as string))
      if (unknown.length) throw new BadRequestException(`No such skill: ${unknown.join(', ')}`)
      out.skills = [...new Set(input.skills as string[])]
    }
    if (input.triggers !== undefined) out.triggers = this.validTriggers(input.triggers)
    if (input.knowledge !== undefined) out.knowledge = await this.validKnowledge(workspaceId, input.knowledge)
    return out
  }

  private validTriggers(raw: unknown): SuperAgentTriggers {
    if (!raw || typeof raw !== 'object') throw new BadRequestException('Triggers are mention, dm, assign and schedule')
    const t = raw as Record<string, Record<string, unknown> | undefined>
    const plain = (key: 'mention' | 'dm' | 'assign') => {
      const v = t[key] ?? {}
      const instructions = v.instructions === undefined ? undefined : v.instructions
      if (instructions !== undefined && (typeof instructions !== 'string' || instructions.length > 2000)) {
        throw new BadRequestException('A trigger’s instructions are text of at most 2000 characters')
      }
      return { on: v.on === true, ...(instructions ? { instructions: instructions as string } : {}) }
    }
    const s = t.schedule ?? {}
    const every = (s.every ?? 'daily') as string
    if (!(SCHEDULE_EVERY as readonly string[]).includes(every)) throw new BadRequestException('A schedule runs hourly, daily, weekly or monthly')
    const at = s.at === undefined ? '09:00' : s.at
    if (typeof at !== 'string' || !HH_MM.test(at)) throw new BadRequestException('A schedule’s time is HH:MM')
    const weekday = s.weekday === undefined ? undefined : Number(s.weekday)
    if (weekday !== undefined && (!Number.isInteger(weekday) || weekday < 0 || weekday > 6)) throw new BadRequestException('A weekly schedule’s day is 0 (Sunday) to 6')
    const day = s.day === undefined ? undefined : Number(s.day)
    if (day !== undefined && (!Number.isInteger(day) || day < 1 || day > 28)) throw new BadRequestException('A monthly schedule’s day is 1 to 28')
    const instructions = s.instructions
    if (instructions !== undefined && (typeof instructions !== 'string' || instructions.length > 2000)) {
      throw new BadRequestException('A trigger’s instructions are text of at most 2000 characters')
    }
    return {
      mention: plain('mention'),
      dm: plain('dm'),
      assign: plain('assign'),
      schedule: {
        on: s.on === true,
        every: every as SuperAgentTriggers['schedule']['every'],
        at,
        ...(weekday !== undefined ? { weekday } : {}),
        ...(day !== undefined ? { day } : {}),
        ...(instructions ? { instructions: instructions as string } : {}),
        since: new Date().toISOString(),
      },
    }
  }

  /** Where it may read: spaces, folders or lists of its own workspace, each checked to be one. */
  private async validKnowledge(workspaceId: string, raw: unknown): Promise<SuperAgentKnowledge> {
    if (!raw || typeof raw !== 'object') throw new BadRequestException('Knowledge is a list of locations')
    const k = raw as { locations?: unknown; help?: unknown }
    const locations = Array.isArray(k.locations) ? k.locations : []
    const out: SuperAgentKnowledge['locations'] = []
    for (const l of locations) {
      const loc = l as { kind?: unknown; id?: unknown }
      if (!loc || !['space', 'project', 'list'].includes(loc.kind as string) || typeof loc.id !== 'string' || !isUuid(loc.id)) {
        throw new BadRequestException('A location is a space, a folder or a list, by its id')
      }
      const kind = loc.kind as 'space' | 'project' | 'list'
      const [found] =
        kind === 'space'
          ? await this.db.select({ id: spaces.id }).from(spaces).where(and(eq(spaces.id, loc.id), eq(spaces.workspaceId, workspaceId))).limit(1)
          : kind === 'project'
            ? await this.db
                .select({ id: projects.id })
                .from(projects)
                .innerJoin(spaces, eq(spaces.id, projects.spaceId))
                .where(and(eq(projects.id, loc.id), eq(spaces.workspaceId, workspaceId)))
                .limit(1)
            : await this.db
                .select({ id: lists.id })
                .from(lists)
                .innerJoin(projects, eq(projects.id, lists.projectId))
                .innerJoin(spaces, eq(spaces.id, projects.spaceId))
                .where(and(eq(lists.id, loc.id), eq(spaces.workspaceId, workspaceId)))
                .limit(1)
      if (!found) throw new BadRequestException('That location is not in this workspace')
      out.push({ kind, id: loc.id })
    }
    return { locations: out, help: k.help === true }
  }
}
