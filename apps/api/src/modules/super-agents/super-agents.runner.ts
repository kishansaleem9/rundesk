import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { and, desc, eq, inArray, or } from 'drizzle-orm'
import { chatChannelMembers, lists, projects, spaces, superAgentMemories, superAgentRuns, superAgents, taskComments, tasks, users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { agentTriggers, type AssignEvent, type ChatEvent, type CommentEvent } from '../../common/agents/agent-triggers'
import { AiService } from '../ai/ai.service'
import { TasksService } from '../tasks/tasks.service'
import { ChatService } from '../chat/chat.service'
import { SuperAgentsService } from './super-agents.service'
import { scheduleDue } from './schedule'
import { BrainComments } from './brain-comments'

type Agent = typeof superAgents.$inferSelect
type Trigger = 'mention' | 'dm' | 'assign' | 'schedule' | 'automation' | 'manual'
/** Where the answer goes: a threaded comment, a reply in a channel's thread, a DM, or only the run (a test from the profile). */
type Reply =
  | { kind: 'comment'; taskId: string; parentCommentId: string }
  | { kind: 'chat'; channelId: string; parentMessageId: string | null }
  | { kind: 'none' }

const RECENT_KEPT = 20
/** A Skill in the words its introduction says it in. */
const SKILL_WORDS: Record<string, string> = {
  search_tasks: 'find tasks',
  create_task: 'create tasks',
  set_task_status: 'change a task’s status',
  reschedule_task: 'reschedule a task',
  assign_task: 'assign tasks',
  bulk_reschedule: 'reschedule many tasks',
}

/**
 * RUNNING A SUPER AGENT (`ledger-rows/row-852`), from the moments ClickUp starts
 * one: an @mention in a comment or in Chat, a direct message, an assignment, a
 * schedule, an Automation, or "Run agent" on its profile.
 *
 * Every run is written down first and finished last, whatever happens between,
 * so Activity lists the ones that failed and the ones that were skipped with
 * why. An agent answers where it was asked, as itself; what it DOES with its
 * Skills is done under the rights of the person it is acting for — whoever
 * started it, or its maker on a schedule — so an agent never lets anybody do
 * what they could not do themselves. An agent's own words start nothing: an
 * answer that names another agent does not wake it, so two agents cannot talk
 * each other into a loop.
 */
@Injectable()
export class SuperAgentsRunner implements OnModuleInit {
  private readonly log = new Logger(SuperAgentsRunner.name)

  constructor(
    @Inject(DB_TOKEN) private readonly db: Db,
    private readonly agents: SuperAgentsService,
    private readonly ai: AiService,
    private readonly tasks: TasksService,
    private readonly chat: ChatService,
    private readonly brain: BrainComments,
  ) {}

  onModuleInit() {
    agentTriggers.listen({
      comment: (e) => this.onComment(e),
      chat: (e) => this.onChat(e),
      assigned: (e) => this.onAssigned(e),
      automation: async (e) => {
        await this.runFromAutomation(e.agentId, e.taskId, e.instructions, e.actorId, e.workspaceId)
      },
    })
  }

  /** An agent's own account wrote it: nothing an agent says starts an agent. */
  private async isAgentAccount(userId: string) {
    const [u] = await this.db.select({ isAgent: users.isAgent }).from(users).where(eq(users.id, userId)).limit(1)
    return !!u?.isAgent
  }

  private async agentsAmong(userIds: string[]) {
    if (!userIds.length) return []
    return this.db.select().from(superAgents).where(inArray(superAgents.userId, [...new Set(userIds)]))
  }

  async onComment(e: CommentEvent) {
    if (await this.isAgentAccount(e.authorId)) return
    // @Brain, named in the comment, answers in its thread too (`ledger-rows/row-745`).
    await this.brain.onComment(e)
    for (const agent of await this.agentsAmong(e.mentionedUserIds)) {
      const [task] = await this.db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, e.taskId)).limit(1)
      await this.run(agent, {
        trigger: 'mention',
        triggeredById: e.authorId,
        location: { kind: 'task', id: e.taskId, title: task?.title },
        input: e.body,
        reply: { kind: 'comment', taskId: e.taskId, parentCommentId: e.threadId },
      })
    }
  }

  async onChat(e: ChatEvent) {
    if (await this.isAgentAccount(e.authorId)) return
    const mentioned = await this.agentsAmong(e.mentionedUserIds)
    for (const agent of mentioned) {
      await this.run(agent, {
        trigger: 'mention',
        triggeredById: e.authorId,
        location: { kind: 'channel', id: e.channelId },
        input: e.body,
        // A mention is answered in a thread, as ClickUp's agents answer one.
        reply: { kind: 'chat', channelId: e.channelId, parentMessageId: e.threadId },
      })
    }
    if (!e.isDm || mentioned.length) return
    // A direct message: the other member of the DM, when that is an agent.
    const members = await this.db
      .select({ userId: chatChannelMembers.userId })
      .from(chatChannelMembers)
      .where(eq(chatChannelMembers.channelId, e.channelId))
    const others = members.map((m) => m.userId).filter((u) => u !== e.authorId)
    for (const agent of await this.agentsAmong(others)) {
      await this.run(agent, {
        trigger: 'dm',
        triggeredById: e.authorId,
        location: { kind: 'dm', id: e.channelId },
        input: e.body,
        // In the DM, or in the DM's thread when that is where it was asked.
        reply: { kind: 'chat', channelId: e.channelId, parentMessageId: e.threadId === e.messageId ? null : e.threadId },
      })
    }
  }

  async onAssigned(e: AssignEvent) {
    if (await this.isAgentAccount(e.actorId)) return
    const agent = await this.agents.byAccount(e.userId)
    if (!agent) return
    const [task] = await this.db
      .select({ title: tasks.title, description: tasks.description })
      .from(tasks)
      .where(eq(tasks.id, e.taskId))
      .limit(1)
    if (!task) return
    await this.run(agent, {
      trigger: 'assign',
      triggeredById: e.actorId,
      location: { kind: 'task', id: e.taskId, title: task.title },
      input: `You were assigned the task “${task.title}”.${task.description ? `\n\n${task.description}` : ''}`,
      reply: { kind: 'comment', taskId: e.taskId, parentCommentId: '' },
    })
  }

  /**
   * A NEW AGENT SAYS WHAT IT IS, as ClickUp's does once it is made: a direct
   * message to its maker naming what it can do (its Skills), what starts it (its
   * Triggers), and what it cannot — anything the person it acts for could not.
   * Written from its profile, not by the model, so it is said with or without one.
   */
  async introduce(agentId: string) {
    const [agent] = await this.db.select().from(superAgents).where(eq(superAgents.id, agentId)).limit(1)
    if (!agent) return
    const dm = await this.chat.ensureDmChannel(agent.workspaceId, agent.userId, agent.createdById)
    const can = agent.skills.map((k) => SKILL_WORDS[k] ?? k)
    const t = agent.triggers
    const starts = [
      t?.mention?.on ? 'an @mention in a comment or in Chat' : null,
      t?.dm?.on ? 'a direct message' : null,
      t?.assign?.on ? 'being assigned a task' : null,
      t?.schedule?.on ? `my schedule (${t.schedule.every}${t.schedule.every === 'hourly' ? '' : ` at ${t.schedule.at ?? '09:00'}`})` : null,
    ].filter(Boolean)
    const body = [
      `Hi, I'm ${agent.name}.${agent.description ? ` ${agent.description}` : ''}`,
      `What I can do: ${can.length ? can.join(', ') : 'answer questions'}.`,
      `What starts me: ${starts.length ? starts.join(', ') : 'Run agent on my profile, or an Automation'}.`,
      'What I can’t do: anything the person I work for could not — I act with their rights, and only where they may.',
    ].join('\n')
    await this.chat.postMessage({ channelId: dm.id, authorId: agent.userId, body, actingForId: agent.createdById })
  }

  /** "Run agent" on the profile: a test, answered on the run itself. */
  async runManually(agentId: string, actor: { id: string }, prompt: string) {
    const agent = await this.agents.findVisible(agentId, actor)
    return this.run(agent, {
      trigger: 'manual',
      triggeredById: actor.id,
      location: { kind: 'profile', id: agent.id },
      input: prompt,
      reply: { kind: 'none' },
    })
  }

  /** From an Automation's "Run Super Agent" action, with its own instructions, on the task that fired it. */
  async runFromAutomation(agentId: string, taskId: string, instructions: string, actorId: string | null, workspaceId: string) {
    // Only an agent of the Automation's own workspace: a rule never starts another workspace's agent.
    const [agent] = await this.db
      .select()
      .from(superAgents)
      .where(and(eq(superAgents.id, agentId), eq(superAgents.workspaceId, workspaceId)))
      .limit(1)
    if (!agent) return null
    const [task] = await this.db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, taskId)).limit(1)
    return this.run(agent, {
      trigger: 'automation',
      triggeredById: actorId ?? agent.createdById,
      location: { kind: 'task', id: taskId, title: task?.title },
      input: instructions || `An Automation ran you on the task “${task?.title ?? ''}”.`,
      reply: { kind: 'comment', taskId, parentCommentId: '' },
    })
  }

  /**
   * EVERY MINUTE, THE AGENTS WHOSE SCHEDULE IS DUE: hourly, daily, weekly or
   * monthly at its time in its maker's zone (`schedule.ts`). One that is still
   * running is skipped, never doubled, as ClickUp guards its schedules; the
   * answer goes to its maker as a direct message.
   */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'super-agents-schedules' })
  async runSchedules(now: Date = new Date()) {
    const due = await this.db.select().from(superAgents).where(eq(superAgents.isActive, true))
    for (const agent of due) {
      const s = agent.triggers?.schedule
      if (!s?.on) continue
      const [last] = await this.db
        .select({ startedAt: superAgentRuns.startedAt, status: superAgentRuns.status })
        .from(superAgentRuns)
        .where(and(eq(superAgentRuns.agentId, agent.id), eq(superAgentRuns.trigger, 'schedule')))
        .orderBy(desc(superAgentRuns.startedAt))
        .limit(1)
      const [maker] = await this.db.select({ timezone: users.timezone }).from(users).where(eq(users.id, agent.createdById)).limit(1)
      if (!scheduleDue(s, now, last?.startedAt ?? null, maker?.timezone ?? 'UTC')) continue
      if (last?.status === 'running') {
        await this.record(agent, { trigger: 'schedule', triggeredById: null, location: null, input: '', status: 'skipped', error: 'The last scheduled run was still going' })
        continue
      }
      const dm = await this.chat.ensureDmChannel(agent.workspaceId, agent.userId, agent.createdById).catch(() => null)
      await this.run(agent, {
        trigger: 'schedule',
        triggeredById: null,
        location: dm ? { kind: 'dm', id: dm.id } : null,
        input: 'Your schedule ran.',
        reply: dm ? { kind: 'chat', channelId: dm.id, parentMessageId: null } : { kind: 'none' },
      })
    }
  }

  private async record(
    agent: Agent,
    row: { trigger: Trigger; triggeredById: string | null; location: (typeof superAgentRuns.$inferInsert)['location']; input: string; status: 'skipped'; error: string },
  ) {
    const [run] = await this.db
      .insert(superAgentRuns)
      .values({ agentId: agent.id, workspaceId: agent.workspaceId, finishedAt: new Date(), ...row })
      .returning()
    return run
  }

  /** One run, start to finish: written down first, refused or carried out, answered where it was asked, finished last. */
  async run(
    agent: Agent,
    job: {
      trigger: Trigger
      triggeredById: string | null
      location: (typeof superAgentRuns.$inferInsert)['location']
      input: string
      reply: Reply
    },
  ) {
    const skip = async (why: string) =>
      this.record(agent, { trigger: job.trigger, triggeredById: job.triggeredById, location: job.location, input: job.input.slice(0, 4000), status: 'skipped', error: why })
    if (!agent.isActive) return skip('This Super Agent is switched off')
    const triggerKey = job.trigger === 'automation' || job.trigger === 'manual' ? null : job.trigger
    if (triggerKey && !agent.triggers?.[triggerKey]?.on) return skip(`This Super Agent is not started by ${triggerKey === 'dm' ? 'a direct message' : triggerKey === 'mention' ? 'an @mention' : triggerKey === 'assign' ? 'an assignment' : 'a schedule'}`)
    // Who it acts for: whoever started it, or its maker on a schedule. Somebody it is not shared with starts nothing.
    const actorId = job.triggeredById ?? agent.createdById
    if (!(await this.agents.mayUse(agent, actorId))) return skip('Whoever started it may not use this Super Agent')

    const [run] = await this.db
      .insert(superAgentRuns)
      .values({
        agentId: agent.id,
        workspaceId: agent.workspaceId,
        trigger: job.trigger,
        triggeredById: job.triggeredById,
        location: job.location,
        input: job.input.slice(0, 4000),
      })
      .returning()
    // What it carried out, kept with the run whether it then finishes or fails: work done is done.
    let actionsCompleted = 0
    try {
      const memories = await this.db
        .select({ kind: superAgentMemories.kind, content: superAgentMemories.content })
        .from(superAgentMemories)
        .where(and(eq(superAgentMemories.agentId, agent.id), eq(superAgentMemories.approved, true)))
        .orderBy(desc(superAgentMemories.createdAt))
        .limit(30)
      const triggerInstructions =
        (job.trigger === 'automation' || job.trigger === 'manual' ? '' : agent.triggers?.[job.trigger]?.instructions) ?? ''
      const thread = job.reply.kind === 'comment' && job.reply.parentCommentId ? await this.threadText(job.reply.parentCommentId) : ''
      const system = [
        `You are ${agent.name}, a Super Agent in Rundesk. You answer as yourself, briefly, in plain text.`,
        agent.description ? `What you are for: ${agent.description}` : '',
        agent.instructions ? `Your instructions:\n${agent.instructions}` : '',
        `What started you: ${describeTrigger(job.trigger)}.${triggerInstructions ? ` For this, your instructions are:\n${triggerInstructions}` : ''}`,
        memories.length ? `What you remember:\n${memories.map((m) => `- (${m.kind}) ${m.content}`).join('\n')}` : '',
        thread ? `The thread so far:\n${thread}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
      const turn = await this.ai.agentTurn(
        agent.workspaceId,
        { system, message: job.input || 'Do what you are for.', tools: agent.skills, listIds: await this.knowledgeLists(agent) },
        // Its calls are written down as this run's, so what the agent costs is its own.
        { workspaceId: agent.workspaceId, userId: actorId, agentRunId: run.id },
      )
      // What it asked to do, done as the person it acts for, and said beside its answer.
      const done: string[] = []
      if (turn.plan?.actions.length) {
        const results = await this.ai.executeActions(turn.plan.actions, actorId)
        for (const r of results.results) {
          const carriedOut = r.status === 'succeeded' || (r.status as string) === 'done'
          if (carriedOut) actionsCompleted += 1
          done.push(carriedOut ? `✓ ${r.humanLabel}` : `✗ ${r.humanLabel} — ${r.reason ?? r.status}`)
        }
      }
      // What it was asked for and could not do is said too, as the command assistant's plan says it.
      const skipped = (turn.plan?.warnings ?? []).map((w) => `⚠ ${w}`)
      const answer = [turn.text || (done.length || skipped.length ? '' : 'Done.'), ...done, ...skipped].filter(Boolean).join('\n')
      await this.answer(agent, job.reply, answer, actorId)
      // "Remember …" from the person: a preference, kept once approved.
      const asked = /^\s*remember(?: that)?\s+(.+)$/i.exec(job.input.trim())
      if (asked) await this.db.insert(superAgentMemories).values({ agentId: agent.id, kind: 'preference', content: asked[1].slice(0, 500), approved: false, createdById: job.triggeredById })
      await this.remember(agent, job.trigger, answer)
      const [finished] = await this.db
        .update(superAgentRuns)
        .set({ status: 'completed', output: answer.slice(0, 8000), finishedAt: new Date(), actionsCompleted })
        .where(eq(superAgentRuns.id, run.id))
        .returning()
      return finished
    } catch (err) {
      const why = err instanceof Error ? err.message : 'The run failed'
      this.log.warn(`Super Agent ${agent.id} failed: ${why}`)
      const [failed] = await this.db
        .update(superAgentRuns)
        .set({ status: 'failed', error: why.slice(0, 500), finishedAt: new Date(), actionsCompleted })
        .where(eq(superAgentRuns.id, run.id))
        .returning()
      return failed
    }
  }

  /** The comment thread a mention is in, oldest first, so the agent answers the conversation and not one line of it. */
  private async threadText(rootId: string) {
    const rows = await this.db
      .select({ body: taskComments.body, author: users.displayName, parent: taskComments.parentCommentId, id: taskComments.id })
      .from(taskComments)
      .innerJoin(users, eq(users.id, taskComments.authorId))
      .where(inArray(taskComments.id, [rootId]))
    const replies = await this.db
      .select({ body: taskComments.body, author: users.displayName })
      .from(taskComments)
      .innerJoin(users, eq(users.id, taskComments.authorId))
      .where(eq(taskComments.parentCommentId, rootId))
      .orderBy(taskComments.createdAt)
      .limit(30)
    return [...rows, ...replies].map((r) => `${r.author}: ${r.body}`).join('\n')
  }

  /**
   * Its answer, where it was asked, as itself: a reply in the comment's thread,
   * in Chat's thread or its DM — written where the person it acts for may
   * write, which the comment and chat rules ask of that person.
   */
  private async answer(agent: Agent, reply: Reply, text: string, actorId: string) {
    if (reply.kind === 'none' || !text.trim()) return
    if (reply.kind === 'comment') {
      await this.tasks.createComment(reply.taskId, agent.userId, text, reply.parentCommentId || undefined, undefined, undefined, { actingForId: actorId })
      return
    }
    await this.chat.postMessage({ channelId: reply.channelId, authorId: agent.userId, body: text, parentMessageId: reply.parentMessageId, actingForId: actorId })
  }

  /** Its Knowledge as the lists it covers — the spaces, folders and lists it was given — or null for everything. */
  private async knowledgeLists(agent: Agent): Promise<string[] | null> {
    const locations = agent.knowledge?.locations ?? []
    if (!locations.length) return null
    const of = (kind: 'space' | 'project' | 'list') => locations.filter((l) => l.kind === kind).map((l) => l.id)
    const [spaceIds, projectIds, listIds] = [of('space'), of('project'), of('list')]
    const rows = await this.db
      .select({ id: lists.id })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(
        and(
          eq(spaces.workspaceId, agent.workspaceId),
          or(
            listIds.length ? inArray(lists.id, listIds) : undefined,
            projectIds.length ? inArray(lists.projectId, projectIds) : undefined,
            spaceIds.length ? inArray(projects.spaceId, spaceIds) : undefined,
          ),
        ),
      )
    return rows.map((r) => r.id)
  }

  /** Recent memory: what it did and when, the last twenty kept. */
  private async remember(agent: Agent, trigger: Trigger, answer: string) {
    const line = `${describeTrigger(trigger)}: ${answer.split('\n')[0].slice(0, 200)}`
    await this.db.insert(superAgentMemories).values({ agentId: agent.id, kind: 'recent', content: line })
    const recent = await this.db
      .select({ id: superAgentMemories.id })
      .from(superAgentMemories)
      .where(and(eq(superAgentMemories.agentId, agent.id), eq(superAgentMemories.kind, 'recent')))
      .orderBy(desc(superAgentMemories.createdAt))
    const old = recent.slice(RECENT_KEPT).map((r) => r.id)
    if (old.length) await this.db.delete(superAgentMemories).where(inArray(superAgentMemories.id, old))
  }
}

function describeTrigger(trigger: Trigger) {
  switch (trigger) {
    case 'mention':
      return 'an @mention'
    case 'dm':
      return 'a direct message'
    case 'assign':
      return 'being assigned a task'
    case 'schedule':
      return 'your schedule'
    case 'automation':
      return 'an Automation'
    default:
      return 'a test run from your profile'
  }
}
