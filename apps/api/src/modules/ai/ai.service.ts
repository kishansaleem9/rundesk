import {
  Injectable,
  Inject,
  HttpException,
  HttpStatus,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Anthropic from '@anthropic-ai/sdk'
import type { Response } from '@nestjs/common'
import { and, asc, desc, eq, gte, inArray, lte, ne, or, sql } from 'drizzle-orm'
import { aiUsage, workspaces, workspaceMembers, spaces, projects, lists, tasks, taskAssignees, users } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'
import { TasksService } from '../tasks/tasks.service'
import {
  COMMAND_TOOLS,
  planFromToolCalls,
  searchTasksInContext,
  type CommandContext,
  type CommandExecuteResult,
  type CommandActionResult,
  type CommandPlan,
  type PlanAction,
  type StatusCategory,
  type ToolCall,
} from './ai-command'

export type AiCtx = { userId?: string; workspaceId?: string }

/** Format a Date | string | null to YYYY-MM-DD, or '' when absent/invalid. */
function toDayString(value: Date | string | null | undefined): string {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

function truncate(input: string, max: number): string {
  const t = (input ?? '').trim().replace(/\s+/g, ' ')
  return t.length > max ? `${t.slice(0, max)}…` : t
}

export type WorkspaceContextData = {
  workspaceName: string
  role: string
  counts: { spaces: number; projects: number; lists: number; openTasks: number }
  spaces: Array<{ name: string; projects: string[] }>
  openTasks: Array<{ title: string; dueDate: Date | string | null; priority: string }>
  history: Array<{ title: string; status: string; updatedAt: Date | string | null }>
  currentView?: string
}

/**
 * Assemble the grounded workspace context string (Plan §7.6/§7.15). Pure and
 * token-bounded: caps structure to 15 spaces × 8 projects, 15 open tasks, and
 * 40 history rows. Extracted from the DB read so it can be unit-tested directly.
 */
export function formatWorkspaceContext(data: WorkspaceContextData): string {
  const c = data.counts
  const lines: string[] = [`Workspace: ${data.workspaceName}`, `Your role: ${data.role}`]
  if (data.currentView) lines.push(`Current view: ${data.currentView}`)
  lines.push(
    `Workspace totals: ${c.spaces} spaces, ${c.projects} projects, ${c.lists} lists, ${c.openTasks} open tasks`,
  )

  if (data.spaces.length) {
    const structure = data.spaces
      .slice(0, 15)
      .map((s) => {
        const shown = s.projects.slice(0, 8)
        const extra = s.projects.length > shown.length ? `, +${s.projects.length - shown.length} more` : ''
        return `- ${s.name}${shown.length ? ` — projects: ${shown.join(', ')}${extra}` : ''}`
      })
      .join('\n')
    lines.push(`Workspace structure:\n${structure}`)
  }

  if (data.openTasks.length) {
    const mine = data.openTasks
      .slice(0, 15)
      .map((t) => {
        const due = toDayString(t.dueDate)
        return `- ${t.title}${due ? ` (due ${due})` : ''} [${t.priority}]`
      })
      .join('\n')
    lines.push(`Your open assigned tasks:\n${mine}`)
  } else {
    lines.push('You have no open assigned tasks.')
  }

  if (data.history.length) {
    const hist = data.history
      .slice(0, 40)
      .map((t) => {
        const when = toDayString(t.updatedAt)
        return `- ${t.title} [${t.status}]${when ? ` (updated ${when})` : ''}`
      })
      .join('\n')
    lines.push(`Recent task history (last 90 days, tasks you're involved in):\n${hist}`)
  }

  return lines.join('\n')
}

export type TaskSummaryInput = {
  title: string
  description: string | null
  status?: string | null
  priority?: string | null
  activity: Array<{ action: string; actor: string | null }>
  subtasks: Array<{ title: string; status: string }>
  blockers: Array<{ title: string; status: string }>
  comments: Array<{ author: string | null; body: string }>
}

/**
 * Assemble the enriched task-summary prompt input (Plan §7.5). Pure and bounded:
 * caps subtasks (12), blockers (10), comments (last 6, trimmed), activity (8).
 * Extracted from the DB reads so it can be unit-tested directly.
 */
export function formatTaskSummaryInput(input: TaskSummaryInput): string {
  const sections: string[] = [`Task: ${input.title || '(untitled)'}`]
  if (input.status) sections.push(`Status: ${input.status}`)
  if (input.priority) sections.push(`Priority: ${input.priority}`)
  sections.push(`Description:\n${input.description?.trim() ? input.description.trim() : '(no description)'}`)

  if (input.subtasks.length) {
    const shown = input.subtasks.slice(0, 12)
    sections.push(
      `Open subtasks (${input.subtasks.length}):\n${shown.map((s) => `- ${s.title} [${s.status}]`).join('\n')}`,
    )
  }
  if (input.blockers.length) {
    const shown = input.blockers.slice(0, 10)
    sections.push(
      `Open blockers (${input.blockers.length}):\n${shown.map((b) => `- ${b.title} [${b.status}]`).join('\n')}`,
    )
  }
  if (input.comments.length) {
    const recent = input.comments.slice(-6)
    sections.push(
      `Recent comments:\n${recent.map((cm) => `- ${cm.author ?? 'Someone'}: ${truncate(cm.body, 240)}`).join('\n')}`,
    )
  }
  if (input.activity.length) {
    const recent = input.activity.slice(0, 8)
    sections.push(
      `Recent activity:\n${recent.map((a) => `- ${a.actor ?? 'Someone'} ${a.action.replace(/_/g, ' ')}`).join('\n')}`,
    )
  }

  return sections.join('\n\n')
}

// Rough per-million-token pricing (USD) for cost *estimation* in reports.
const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
}
function estimateCost(model: string, inTok: number, outTok: number): number {
  const p = MODEL_PRICING[model] ?? { in: 1, out: 5 }
  return (inTok / 1_000_000) * p.in + (outTok / 1_000_000) * p.out
}

@Injectable()
export class AiService {
  private client: Anthropic | null = null

  constructor(
    private config: ConfigService,
    @Inject(DB_TOKEN) private db: Db,
    private tasks: TasksService,
  ) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY')
    if (apiKey) {
      this.client = new Anthropic({ apiKey })
    }
  }

  private get claude() {
    if (!this.client) {
      throw new Error('ANTHROPIC_API_KEY is not configured')
    }
    return this.client
  }

  private get hourlyLimit(): number {
    const v = Number(this.config.get<string>('AI_HOURLY_LIMIT'))
    return Number.isFinite(v) && v > 0 ? v : 200
  }

  /**
   * Enforce a per-user hourly AI call cap (Plan §7.15 "per-user rate limits").
   * Throws 429 when exceeded. No-op for calls without a user context.
   */
  private get orgHourlyLimit(): number {
    const v = Number(this.config.get<string>('AI_ORG_HOURLY_LIMIT'))
    return Number.isFinite(v) && v > 0 ? v : 2000
  }

  async assertWithinRateLimit(ctx: AiCtx, now: Date = new Date()) {
    const since = new Date(now.getTime() - 3_600_000)
    if (ctx.userId) {
      const [row] = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(aiUsage)
        .where(and(eq(aiUsage.userId, ctx.userId), gte(aiUsage.createdAt, since)))
      if ((row?.c ?? 0) >= this.hourlyLimit) {
        throw new HttpException(
          `AI hourly rate limit reached (${this.hourlyLimit}/hour). Try again later.`,
          HttpStatus.TOO_MANY_REQUESTS,
        )
      }
    }
    // Per-organization (workspace) cap (Plan §7.15).
    if (ctx.workspaceId) {
      const [row] = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(aiUsage)
        .where(and(eq(aiUsage.workspaceId, ctx.workspaceId), gte(aiUsage.createdAt, since)))
      if ((row?.c ?? 0) >= this.orgHourlyLimit) {
        throw new HttpException(
          `Workspace AI hourly limit reached (${this.orgHourlyLimit}/hour). Try again later.`,
          HttpStatus.TOO_MANY_REQUESTS,
        )
      }
    }
  }

  /**
   * Create a message: rate-limit, enable prompt caching on the system block,
   * and record token usage (Plan §7.15). All non-streaming AI calls route here.
   */
  private async complete(
    feature: string,
    ctx: AiCtx,
    params: Anthropic.Messages.MessageCreateParamsNonStreaming,
  ) {
    await this.assertWithinRateLimit(ctx)
    // Prompt caching: mark the (repeated) system prompt as a cache breakpoint.
    const finalParams: Anthropic.Messages.MessageCreateParamsNonStreaming =
      typeof params.system === 'string' && params.system.length > 200
        ? { ...params, system: [{ type: 'text', text: params.system, cache_control: { type: 'ephemeral' } }] }
        : params
    const response = await this.claude.messages.create(finalParams)
    void this.recordUsage(feature, params.model, ctx, response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0)
    return response
  }

  async recordUsage(feature: string, model: string, ctx: AiCtx, inputTokens: number, outputTokens: number) {
    try {
      await this.db.insert(aiUsage).values({
        workspaceId: ctx.workspaceId ?? null,
        userId: ctx.userId ?? null,
        feature,
        model,
        inputTokens,
        outputTokens,
      })
    } catch {
      // Usage tracking must never break an AI response.
    }
  }

  /** Aggregate AI usage + estimated cost, per user and per model (Plan §7.15). */
  async usageSummary(opts: { workspaceId?: string; from?: Date; to?: Date } = {}) {
    const filters = []
    if (opts.workspaceId) filters.push(eq(aiUsage.workspaceId, opts.workspaceId))
    if (opts.from) filters.push(gte(aiUsage.createdAt, opts.from))
    if (opts.to) filters.push(lte(aiUsage.createdAt, opts.to))
    const where = filters.length ? and(...filters) : undefined

    const rows = await this.db
      .select({
        userId: aiUsage.userId,
        model: aiUsage.model,
        inTok: sql<number>`coalesce(sum(${aiUsage.inputTokens}),0)::int`,
        outTok: sql<number>`coalesce(sum(${aiUsage.outputTokens}),0)::int`,
        calls: sql<number>`count(*)::int`,
      })
      .from(aiUsage)
      .where(where)
      .groupBy(aiUsage.userId, aiUsage.model)

    let totalCost = 0
    let totalCalls = 0
    let totalIn = 0
    let totalOut = 0
    const byUser: Record<string, { calls: number; inputTokens: number; outputTokens: number; costUsd: number }> = {}
    const byModel: Record<string, { calls: number; inputTokens: number; outputTokens: number; costUsd: number }> = {}
    for (const r of rows) {
      const cost = estimateCost(r.model, r.inTok, r.outTok)
      totalCost += cost
      totalCalls += r.calls
      totalIn += r.inTok
      totalOut += r.outTok
      const u = (byUser[r.userId ?? 'unknown'] ??= { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 })
      u.calls += r.calls; u.inputTokens += r.inTok; u.outputTokens += r.outTok; u.costUsd += cost
      const m = (byModel[r.model] ??= { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 })
      m.calls += r.calls; m.inputTokens += r.inTok; m.outputTokens += r.outTok; m.costUsd += cost
    }
    const round = (n: number) => Math.round(n * 10000) / 10000
    return {
      totals: { calls: totalCalls, inputTokens: totalIn, outputTokens: totalOut, costUsd: round(totalCost) },
      byUser: Object.fromEntries(Object.entries(byUser).map(([k, v]) => [k, { ...v, costUsd: round(v.costUsd) }])),
      byModel: Object.fromEntries(Object.entries(byModel).map(([k, v]) => [k, { ...v, costUsd: round(v.costUsd) }])),
    }
  }

  // ─── Task generation from a natural language prompt ───────────────────────
  async generateTask(
    prompt: string,
    context?: string,
    ctx: AiCtx = {},
    customFields?: Array<{ name: string; type: string; options?: string[] }>,
  ): Promise<{
    title: string
    description: string
    subtasks: string[]
    priority: 'urgent' | 'high' | 'normal' | 'low'
    estimatedHours?: number
    customFieldValues?: Array<{ fieldName: string; value: string | number | boolean }>
  }> {
    // When the destination project has custom fields, let the model suggest
    // values for them (resolved by name on save, like the task-template path).
    const fieldsBlock = customFields?.length
      ? `\nThe destination project has these custom fields — suggest values ONLY for fields you can confidently fill, as a "customFieldValues" array of { "fieldName": string, "value": string|number|boolean }. Use the EXACT field name. Omit fields you cannot fill.\n${customFields
          .map((f) => `- ${f.name} (${f.type}${f.options?.length ? `: ${f.options.join(', ')}` : ''})`)
          .join('\n')}`
      : ''

    const systemPrompt = `You are a project management assistant for Rundesk.
When given a natural language description, generate a structured task definition.
Respond ONLY with valid JSON matching this exact shape:
{
  "title": "string (concise, action-oriented)",
  "description": "string (detailed markdown description)",
  "subtasks": ["string", ...],
  "priority": "urgent" | "high" | "normal" | "low",
  "estimatedHours": number | null${customFields?.length ? ',\n  "customFieldValues": [{ "fieldName": "string", "value": "string|number|boolean" }]' : ''}
}
${context ? `\nWorkspace context:\n${context}` : ''}${fieldsBlock}`

    const response = await this.complete('task.generate', ctx, {
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Create a task for: ${prompt}` }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]+\}/)
    if (!jsonMatch) throw new Error('AI returned invalid response')
    return JSON.parse(jsonMatch[0])
  }

  // ─── Meeting notes → action items ─────────────────────────────────────────
  async extractTasksFromNotes(notes: string, ctx: AiCtx = {}): Promise<Array<{
    title: string
    description: string
    assigneeName?: string
    dueDate?: string
    priority: string
  }>> {
    const response = await this.complete('meeting.notes', ctx, {
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: `You are a meeting notes analyzer for Rundesk.
Extract all action items from the meeting notes and return them as a JSON array.
Each action item should have: title, description, assigneeName (if mentioned), dueDate (ISO 8601 if mentioned, else null), priority (urgent/high/normal/low).
Respond ONLY with a valid JSON array.`,
      messages: [{ role: 'user', content: `Meeting notes:\n\n${notes}` }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
    const jsonMatch = text.match(/\[[\s\S]+\]/)
    if (!jsonMatch) return []
    return JSON.parse(jsonMatch[0])
  }

  // ─── Auto-priority detection ──────────────────────────────────────────────
  async suggestPriority(title: string, description?: string, ctx: AiCtx = {}): Promise<{
    priority: 'urgent' | 'high' | 'normal' | 'low'
    reasoning: string
  }> {
    const response = await this.complete('task.priority', ctx, {
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      system: `You are a task prioritizer. Given a task title and optional description, suggest the appropriate priority.
Respond ONLY with valid JSON: { "priority": "urgent" | "high" | "normal" | "low", "reasoning": "string" }`,
      messages: [
        {
          role: 'user',
          content: `Task: ${title}${description ? `\n\nDescription: ${description}` : ''}`,
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]+\}/)
    if (!jsonMatch) return { priority: 'normal', reasoning: 'Could not determine priority' }
    return JSON.parse(jsonMatch[0])
  }

  // ─── Task / Project summary ───────────────────────────────────────────────
  async summarize(content: string, type: 'task' | 'project' = 'task', ctx: AiCtx = {}): Promise<string> {
    const response = await this.complete('summarize', ctx, {
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system: `You are a concise summarizer for Rundesk.
Write a 2-3 sentence summary of the given ${type} content in plain text.
Focus on the key goals, current status, and any blockers.`,
      messages: [{ role: 'user', content: content }],
    })

    return response.content[0].type === 'text' ? response.content[0].text : ''
  }

  // ─── Writing assistant ────────────────────────────────────────────────────
  async improveWriting(
    text: string,
    mode: 'improve' | 'shorten' | 'expand' | 'format' = 'improve',
    ctx: AiCtx = {},
  ): Promise<string> {
    const instructions: Record<string, string> = {
      improve: 'Improve the clarity, grammar, and professionalism of this text while keeping the same meaning.',
      shorten: 'Shorten this text to its essential points without losing meaning.',
      expand: 'Expand this text with more detail and context.',
      format: 'Reformat this text with proper markdown: headings, bullet points, bold for key terms.',
    }

    const response = await this.complete('writing.improve', ctx, {
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: `You are a writing assistant. ${instructions[mode]} Return ONLY the improved text.`,
      messages: [{ role: 'user', content: text }],
    })

    return response.content[0].type === 'text' ? response.content[0].text : text
  }

  // ─── AI Chatbot (streaming) ───────────────────────────────────────────────
  async chatStream(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    workspaceContext: string,
    res: Response,
    ctx: AiCtx = {},
  ): Promise<void> {
    // Enforce rate limits before we hijack the reply for streaming.
    await this.assertWithinRateLimit(ctx)

    const systemPrompt = `You are Rundesk AI, an intelligent assistant embedded in the Rundesk project management platform.
You help users manage tasks, understand their workspace, draft messages, generate content, and answer questions.
Be concise, helpful, and action-oriented.

Workspace context:
${workspaceContext}

Current date: ${new Date().toISOString().split('T')[0]}`

    // This runs on Fastify, whose reply has no setHeader/write/end — use the
    // underlying Node response (reply.raw) and hijack the reply so Fastify
    // doesn't also try to send one.
    const reply = res as any
    if (typeof reply.hijack === 'function') reply.hijack()
    const raw = reply.raw ?? reply
    raw.setHeader('Content-Type', 'text/event-stream')
    raw.setHeader('Cache-Control', 'no-cache')
    raw.setHeader('Connection', 'keep-alive')
    raw.flushHeaders?.()

    try {
      const stream = this.claude.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        // Cache the (large, repeated) system context across turns.
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages,
      })

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          raw.write(`data: ${JSON.stringify({ delta: chunk.delta.text })}\n\n`)
        }
      }
      const final = await stream.finalMessage().catch(() => null)
      void this.recordUsage(
        'chat',
        'claude-sonnet-4-6',
        ctx,
        final?.usage?.input_tokens ?? 0,
        final?.usage?.output_tokens ?? 0,
      )
      raw.write('data: [DONE]\n\n')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI request failed'
      raw.write(`data: ${JSON.stringify({ error: message })}\n\n`)
    } finally {
      raw.end()
    }
  }

  /**
   * Non-streaming chatbot reply (Plan §7.6) — used when @Rundesk is mentioned
   * in a channel so the answer can be posted as a normal message.
   */
  async chatReply(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    workspaceContext: string,
    ctx: AiCtx = {},
  ): Promise<string> {
    const systemPrompt = `You are Rundesk AI, an assistant inside the Rundesk project management chat.
A teammate mentioned you (@Rundesk). Answer helpfully and concisely in 1-4 sentences.

Workspace context:
${workspaceContext}

Current date: ${new Date().toISOString().split('T')[0]}`
    const response = await this.complete('chat.mention', ctx, {
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      system: systemPrompt,
      messages,
    })
    return response.content[0]?.type === 'text' ? response.content[0].text : ''
  }

  /**
   * Build a real workspace context string for the chatbot (Plan §7.6/§7.15):
   * the user's role, workspace structure (space/project/list counts + names),
   * their open assigned tasks, and their recent task history (last 90 days) —
   * plus an optional current-view hint from the caller — so answers are grounded
   * instead of a workspace-ID stub. Token-bounded via `formatWorkspaceContext`.
   */
  async buildWorkspaceContext(
    workspaceId: string,
    userId: string,
    opts: { currentView?: string } = {},
  ): Promise<string> {
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      const [[wsRow], [roleRow], [counts], spaceRows, projectRows, openTasks, history] = await Promise.all([
        this.db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1),
        this.db
          .select({ role: workspaceMembers.role })
          .from(workspaceMembers)
          .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
          .limit(1),
        this.db
          .select({
            spaces: sql<number>`count(distinct ${spaces.id})::int`,
            projects: sql<number>`count(distinct ${projects.id})::int`,
            lists: sql<number>`count(distinct ${lists.id})::int`,
            openTasks: sql<number>`count(distinct case when ${tasks.statusCategory} <> 'closed' and ${tasks.isArchived} = false then ${tasks.id} end)::int`,
          })
          .from(spaces)
          .leftJoin(projects, eq(projects.spaceId, spaces.id))
          .leftJoin(lists, eq(lists.projectId, projects.id))
          .leftJoin(tasks, eq(tasks.listId, lists.id))
          .where(eq(spaces.workspaceId, workspaceId)),
        this.db
          .select({ id: spaces.id, name: spaces.name })
          .from(spaces)
          .where(eq(spaces.workspaceId, workspaceId))
          .orderBy(asc(spaces.name))
          .limit(20),
        this.db
          .select({ id: projects.id, name: projects.name, spaceId: projects.spaceId })
          .from(projects)
          .innerJoin(spaces, eq(spaces.id, projects.spaceId))
          .where(eq(spaces.workspaceId, workspaceId))
          .orderBy(asc(projects.name))
          .limit(60),
        this.db
          .select({ title: tasks.title, dueDate: tasks.dueDate, priority: tasks.priority })
          .from(tasks)
          .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
          .innerJoin(lists, eq(lists.id, tasks.listId))
          .innerJoin(projects, eq(projects.id, lists.projectId))
          .innerJoin(spaces, eq(spaces.id, projects.spaceId))
          .where(
            and(
              eq(spaces.workspaceId, workspaceId),
              eq(taskAssignees.userId, userId),
              eq(tasks.isArchived, false),
              ne(tasks.statusCategory, 'closed'),
            ),
          )
          .orderBy(asc(tasks.dueDate))
          .limit(15),
        // Task history (Plan §7.15): recently updated/completed tasks the user is
        // involved in (creator or assignee) within the last 90 days.
        this.db
          .select({ title: tasks.title, status: tasks.status, updatedAt: tasks.updatedAt })
          .from(tasks)
          .innerJoin(lists, eq(lists.id, tasks.listId))
          .innerJoin(projects, eq(projects.id, lists.projectId))
          .innerJoin(spaces, eq(spaces.id, projects.spaceId))
          .where(
            and(
              eq(spaces.workspaceId, workspaceId),
              gte(tasks.updatedAt, cutoff),
              or(
                eq(tasks.createdById, userId),
                sql`exists (select 1 from ${taskAssignees} where ${taskAssignees.taskId} = ${tasks.id} and ${taskAssignees.userId} = ${userId})`,
              ),
            ),
          )
          .orderBy(desc(tasks.updatedAt))
          .limit(40),
      ])

      const projectsBySpace = new Map<string, string[]>()
      for (const p of projectRows) {
        const list = projectsBySpace.get(p.spaceId) ?? []
        list.push(p.name)
        projectsBySpace.set(p.spaceId, list)
      }
      return formatWorkspaceContext({
        workspaceName: wsRow?.name ?? 'Unknown',
        role: roleRow?.role ?? 'member',
        counts: {
          spaces: counts?.spaces ?? 0,
          projects: counts?.projects ?? 0,
          lists: counts?.lists ?? 0,
          openTasks: counts?.openTasks ?? 0,
        },
        spaces: spaceRows.map((s) => ({ name: s.name, projects: projectsBySpace.get(s.id) ?? [] })),
        openTasks,
        history,
        currentView: opts.currentView,
      })
    } catch {
      return `Workspace ID: ${workspaceId}`
    }
  }

  /**
   * Assemble an enriched summary input for a task (Plan §7.5): title, status,
   * priority and description plus recent activity, open subtasks, open blockers,
   * and recent comments — all read via TasksService. Bounded for token safety by
   * `formatTaskSummaryInput`.
   */
  async buildTaskSummaryInput(taskId: string): Promise<string> {
    const [[taskRow], activity, subtasks, blockers, comments] = await Promise.all([
      this.db
        .select({
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          priority: tasks.priority,
        })
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1),
      this.tasks.listActivity(taskId, 12),
      this.tasks.listSubtasks(taskId),
      this.tasks.getOpenBlockers(taskId),
      this.tasks.listComments(taskId),
    ])
    return formatTaskSummaryInput({
      title: taskRow?.title ?? '',
      description: taskRow?.description ?? null,
      status: taskRow?.status ?? null,
      priority: taskRow?.priority ?? null,
      activity: activity.map((a) => ({
        action: a.action,
        actor: a.actor?.displayName ?? a.actor?.email ?? null,
      })),
      subtasks: subtasks
        .filter((s) => s.statusCategory !== 'closed')
        .map((s) => ({ title: s.title, status: s.status })),
      blockers: blockers.map((b) => ({ title: b.title, status: b.status })),
      comments: (comments as Array<{ author?: { displayName?: string | null; email?: string | null } | null; body?: string | null }>).map((cm) => ({
        author: cm.author?.displayName ?? cm.author?.email ?? null,
        body: cm.body ?? '',
      })),
    })
  }

  /**
   * Streaming task/project summary (Plan §7.5) — mirrors `chatStream`'s SSE
   * framing (`{delta}` / `[DONE]` / `{error}`) so the client renders tokens as
   * they arrive. Uses the same model as the non-streaming `summarize`.
   */
  async summarizeStream(
    content: string,
    type: 'task' | 'project',
    res: Response,
    ctx: AiCtx = {},
  ): Promise<void> {
    await this.assertWithinRateLimit(ctx)

    const systemPrompt = `You are a concise summarizer for Rundesk.
Write a clear summary of the given ${type} in plain text (3-5 sentences).
Focus on the key goals, current status, recent activity, and any blockers or risks.`

    const reply = res as any
    if (typeof reply.hijack === 'function') reply.hijack()
    const raw = reply.raw ?? reply
    raw.setHeader('Content-Type', 'text/event-stream')
    raw.setHeader('Cache-Control', 'no-cache')
    raw.setHeader('Connection', 'keep-alive')
    raw.flushHeaders?.()

    try {
      const stream = this.claude.messages.stream({
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: content || `(no ${type} content provided)` }],
      })

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          raw.write(`data: ${JSON.stringify({ delta: chunk.delta.text })}\n\n`)
        }
      }
      const final = await stream.finalMessage().catch(() => null)
      void this.recordUsage(
        'summarize',
        'claude-haiku-4-5',
        ctx,
        final?.usage?.input_tokens ?? 0,
        final?.usage?.output_tokens ?? 0,
      )
      raw.write('data: [DONE]\n\n')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI request failed'
      raw.write(`data: ${JSON.stringify({ error: message })}\n\n`)
    } finally {
      raw.end()
    }
  }

  // ─── Smart deadline suggestion ────────────────────────────────────────────
  async suggestDeadline(
    title: string,
    description?: string,
    teamWorkload?: string,
    ctx: AiCtx = {},
  ): Promise<{ suggestedDate: string; reasoning: string }> {
    const today = new Date().toISOString().split('T')[0]
    const response = await this.complete('task.deadline', ctx, {
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      system: `You are a project planning assistant. Today's date is ${today}.
Suggest a realistic due date for the given task based on its complexity.
Respond ONLY with valid JSON: { "suggestedDate": "YYYY-MM-DD", "reasoning": "string" }`,
      messages: [
        {
          role: 'user',
          content: `Task: ${title}${description ? `\nDescription: ${description}` : ''}${teamWorkload ? `\nTeam workload: ${teamWorkload}` : ''}`,
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]+\}/)
    if (!jsonMatch) {
      const fallback = new Date()
      fallback.setDate(fallback.getDate() + 7)
      return { suggestedDate: fallback.toISOString().split('T')[0], reasoning: 'Default 7-day estimate' }
    }
    return JSON.parse(jsonMatch[0])
  }

  isAvailable(): boolean {
    return this.client !== null
  }

  // ─── Agentic AI commands (Plan §7.6 / §7.8) ───────────────────────────────

  /** Membership role for (workspace, user), or null when not a member. */
  private async memberRole(workspaceId: string, userId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .limit(1)
    return row?.role ?? null
  }

  private async resolveListWorkspaceId(listId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ workspaceId: spaces.workspaceId })
      .from(lists)
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(lists.id, listId))
      .limit(1)
    return row?.workspaceId ?? null
  }

  private async resolveTaskWorkspaceId(taskId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ workspaceId: spaces.workspaceId })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(projects, eq(projects.id, lists.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .where(eq(tasks.id, taskId))
      .limit(1)
    return row?.workspaceId ?? null
  }

  /**
   * Assert the user may read a task's workspace (Plan §7.5 hardening). Reused by
   * the `/ai/summarize` taskId path so any authed user can no longer summarize an
   * arbitrary task by id.
   */
  async assertTaskWorkspaceAccess(taskId: string, userId: string): Promise<void> {
    const workspaceId = await this.resolveTaskWorkspaceId(taskId)
    if (!workspaceId) throw new NotFoundException('Task not found')
    const role = await this.memberRole(workspaceId, userId)
    if (!role) throw new ForbiddenException('You do not have access to this task')
  }

  /**
   * Load the bounded, DB-resolved context the command planner needs: destination
   * lists (with paths), workspace members (for assigneeEmail→userId), and the
   * open tasks (with assignee emails) that search / bulk filters run against.
   */
  async loadCommandContext(workspaceId: string): Promise<CommandContext> {
    const today = new Date().toISOString().slice(0, 10)
    const [listRows, memberRows, taskRows] = await Promise.all([
      this.db
        .select({ id: lists.id, name: lists.name, projectName: projects.name, spaceName: spaces.name })
        .from(lists)
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(eq(spaces.workspaceId, workspaceId), eq(lists.isArchived, false)))
        .orderBy(asc(spaces.name), asc(projects.name), asc(lists.name))
        .limit(100),
      this.db
        .select({ userId: users.id, email: users.email, displayName: users.displayName })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(eq(workspaceMembers.workspaceId, workspaceId)),
      this.db
        .select({
          id: tasks.id,
          title: tasks.title,
          listId: tasks.listId,
          status: tasks.status,
          statusCategory: tasks.statusCategory,
          dueDate: tasks.dueDate,
        })
        .from(tasks)
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(projects, eq(projects.id, lists.projectId))
        .innerJoin(spaces, eq(spaces.id, projects.spaceId))
        .where(and(eq(spaces.workspaceId, workspaceId), eq(tasks.isArchived, false)))
        .orderBy(asc(tasks.dueDate))
        .limit(300),
    ])

    const taskIds = taskRows.map((t) => t.id)
    const assigneeRows = taskIds.length
      ? await this.db
          .select({ taskId: taskAssignees.taskId, email: users.email })
          .from(taskAssignees)
          .innerJoin(users, eq(users.id, taskAssignees.userId))
          .where(inArray(taskAssignees.taskId, taskIds))
      : []
    const emailsByTask = new Map<string, string[]>()
    for (const row of assigneeRows) {
      const list = emailsByTask.get(row.taskId) ?? []
      list.push(row.email)
      emailsByTask.set(row.taskId, list)
    }

    return {
      today,
      lists: listRows.map((l) => ({ id: l.id, name: l.name, path: `${l.spaceName} / ${l.projectName} / ${l.name}` })),
      members: memberRows.map((m) => ({ userId: m.userId, email: m.email, displayName: m.displayName })),
      tasks: taskRows.map((t) => ({
        id: t.id,
        title: t.title,
        listId: t.listId,
        status: t.status,
        statusCategory: t.statusCategory as StatusCategory,
        dueDate: toDayString(t.dueDate) || null,
        assigneeEmails: emailsByTask.get(t.id) ?? [],
      })),
    }
  }

  /**
   * Run a natural-language command through Anthropic **tool use** and return a
   * preview→confirm PLAN. READ-ONLY `search_tasks` calls run immediately against
   * the context to inform the plan; every MUTATING tool call is validated,
   * resolved, and returned as an action to confirm — nothing mutates here.
   * All model calls route through `complete` (rate limit + usage tracking).
   */
  async command(workspaceId: string, message: string, ctx: AiCtx = {}): Promise<CommandPlan> {
    const [workspaceContext, planCtx] = await Promise.all([
      this.buildWorkspaceContext(workspaceId, ctx.userId ?? ''),
      this.loadCommandContext(workspaceId),
    ])

    const listCatalog = planCtx.lists
      .slice(0, 60)
      .map((l) => `- ${l.id}: ${l.path}`)
      .join('\n')
    const systemPrompt = `You are Rundesk's command assistant. Translate the user's natural-language request into tool calls.
Today's date is ${planCtx.today}.
Use search_tasks (READ-ONLY) to locate task ids before proposing changes; reference tasks by their id.
For any change (create_task / set_task_status / reschedule_task / assign_task / bulk_reschedule) call the matching tool. Changes are PREVIEWED for the user to confirm and are NOT executed until they confirm — do not claim you have already made a change.
When creating a task, pick a listId from "Available lists". Resolve people by their email.

Workspace context:
${workspaceContext}

Available lists (id: path):
${listCatalog || '(none)'}`

    const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: message }]
    const collected: ToolCall[] = []

    // Bounded agentic loop: keep going while the model only searches (so it can
    // act on the results), and stop as soon as it proposes any mutation.
    for (let turn = 0; turn < 5; turn++) {
      const response = await this.complete('command', ctx, {
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        tools: COMMAND_TOOLS,
        messages,
      })

      const toolUses = response.content.filter(
        (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
      )
      if (toolUses.length === 0) break

      messages.push({ role: 'assistant', content: response.content })
      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []
      let hasMutation = false
      for (const toolUse of toolUses) {
        const input = (toolUse.input ?? {}) as Record<string, unknown>
        collected.push({ name: toolUse.name, input })
        if (toolUse.name === 'search_tasks') {
          const found = searchTasksInContext(input, planCtx)
            .slice(0, 25)
            .map((t) => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate, assigneeEmails: t.assigneeEmails }))
          toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(found) })
        } else {
          hasMutation = true
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: 'Queued for the user to confirm (not executed).',
          })
        }
      }
      messages.push({ role: 'user', content: toolResults })
      if (hasMutation) break
    }

    // Deterministic plan (Plan §7.6): honest summary + resolved actions built
    // purely from the collected tool calls, so the preview never over-claims.
    return planFromToolCalls(collected, planCtx)
  }

  /**
   * Execute confirmed actions via TasksService (Plan §7.6). Each mutation is
   * access-checked (TasksService enforces task write permission; create_task
   * verifies non-guest workspace membership) — actions the caller can't perform
   * are skipped and reported rather than failing the batch. TasksService already
   * audits each mutation via its activity log.
   */
  async executeActions(actions: PlanAction[], userId: string): Promise<CommandExecuteResult> {
    const results: CommandActionResult[] = []
    for (const action of actions) {
      try {
        results.push(await this.executeOne(action, userId))
      } catch (err) {
        const skippable =
          err instanceof ForbiddenException || err instanceof NotFoundException || err instanceof BadRequestException
        const reason = err instanceof ForbiddenException ? 'no_permission' : err instanceof Error ? err.message : 'error'
        results.push({
          tool: action.tool,
          humanLabel: action.humanLabel,
          status: skippable ? 'skipped' : 'failed',
          reason,
          affectedTaskIds: action.affectedTaskIds,
        })
      }
    }
    return { results }
  }

  private async executeOne(action: PlanAction, userId: string): Promise<CommandActionResult> {
    switch (action.tool) {
      case 'create_task': {
        const workspaceId = await this.resolveListWorkspaceId(action.args.listId)
        if (!workspaceId) {
          return { tool: action.tool, humanLabel: action.humanLabel, status: 'skipped', reason: 'List not found' }
        }
        const role = await this.memberRole(workspaceId, userId)
        if (!role || role === 'guest') {
          return { tool: action.tool, humanLabel: action.humanLabel, status: 'skipped', reason: 'no_permission' }
        }
        // Only assign a resolved assignee that is actually a member of this workspace.
        let assigneeIds: string[] | undefined
        if (action.args.assigneeId && (await this.memberRole(workspaceId, action.args.assigneeId))) {
          assigneeIds = [action.args.assigneeId]
        }
        const created = await this.tasks.createTask({
          listId: action.args.listId,
          title: action.args.title,
          description: action.args.description,
          priority: action.args.priority,
          dueDate: action.args.dueDate ? new Date(action.args.dueDate) : undefined,
          assigneeIds,
          createdById: userId,
        })
        return {
          tool: action.tool,
          humanLabel: action.humanLabel,
          status: 'succeeded',
          affectedTaskIds: created ? [created.id] : [],
        }
      }
      case 'set_task_status': {
        await this.tasks.updateTask(action.args.taskId, userId, { status: action.args.status })
        return { tool: action.tool, humanLabel: action.humanLabel, status: 'succeeded', affectedTaskIds: action.affectedTaskIds }
      }
      case 'reschedule_task': {
        await this.tasks.updateTask(action.args.taskId, userId, { dueDate: new Date(action.args.dueDate) })
        return { tool: action.tool, humanLabel: action.humanLabel, status: 'succeeded', affectedTaskIds: action.affectedTaskIds }
      }
      case 'assign_task': {
        // Guard against a tampered assigneeId: only assign an actual member.
        const workspaceId = await this.resolveTaskWorkspaceId(action.args.taskId)
        if (workspaceId && !(await this.memberRole(workspaceId, action.args.assigneeId))) {
          return { tool: action.tool, humanLabel: action.humanLabel, status: 'skipped', reason: 'Assignee is not a workspace member' }
        }
        await this.tasks.addAssignee(action.args.taskId, action.args.assigneeId, userId)
        return { tool: action.tool, humanLabel: action.humanLabel, status: 'succeeded', affectedTaskIds: action.affectedTaskIds }
      }
      case 'bulk_reschedule': {
        const res = await this.tasks.bulkUpdateTasks(action.args.taskIds, userId, { dueDate: new Date(action.args.dueDate) })
        const status: CommandActionResult['status'] = res.updatedCount > 0 ? 'succeeded' : 'skipped'
        const reason =
          res.failedCount > 0
            ? res.updatedCount > 0
              ? `${res.updatedCount} updated, ${res.failedCount} skipped`
              : 'no_permission'
            : undefined
        return { tool: action.tool, humanLabel: action.humanLabel, status, reason, affectedTaskIds: action.args.taskIds }
      }
    }
  }

  // ─── Workspace insights (real AI over real metrics) ───────────────────────
  async generateInsights(context: string, ctx: AiCtx = {}): Promise<{
    summary: string
    health: { score: number; label: string; reasoning: string }
    suggestions: Array<{ title: string; detail: string; cta?: string; target?: string }>
  }> {
    const response = await this.complete('insights', ctx, {
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: `You are an analytics assistant for the Rundesk project management app.
Given a workspace's real metrics, produce concise, actionable insights.
Respond ONLY with valid JSON of this exact shape:
{
  "summary": "2-3 sentence plain-text overview of how the workspace is doing",
  "health": { "score": 0-100 integer, "label": "thriving|steady|at_risk", "reasoning": "one sentence" },
  "suggestions": [ { "title": "short", "detail": "one sentence", "cta": "button label", "target": "overdue|sprint|workload|reports" } ]
}
Give 3-4 suggestions. "target" must be one of: overdue, sprint, workload, reports.`,
      messages: [{ role: 'user', content: `Workspace metrics:\n${context}` }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]+\}/)
    if (!jsonMatch) {
      return { summary: 'Insights are unavailable right now.', health: { score: 0, label: 'steady', reasoning: '' }, suggestions: [] }
    }
    return JSON.parse(jsonMatch[0])
  }

  // ─── Dashboard layout suggestion (real AI) ────────────────────────────────
  async suggestDashboardLayout(
    availableWidgets: Array<{ type: string; label: string }>,
    context: string,
    ctx: AiCtx = {},
  ): Promise<{ widgets: string[]; reasoning: string }> {
    const response = await this.complete('dashboard.layout', ctx, {
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system: `You arrange a project dashboard. Choose and order the most useful widgets for this workspace from the available list.
Respond ONLY with valid JSON: { "widgets": ["type", ...], "reasoning": "one sentence" }.
"widgets" must be a subset of the provided widget types, ordered most-important first (4-6 items).`,
      messages: [
        {
          role: 'user',
          content: `Available widgets:\n${availableWidgets.map((w) => `- ${w.type}: ${w.label}`).join('\n')}\n\nWorkspace context:\n${context}`,
        },
      ],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]+\}/)
    if (!jsonMatch) return { widgets: availableWidgets.map((w) => w.type).slice(0, 5), reasoning: '' }
    const parsed = JSON.parse(jsonMatch[0]) as { widgets?: unknown; reasoning?: unknown }
    const valid = new Set(availableWidgets.map((w) => w.type))
    const widgets = Array.isArray(parsed.widgets) ? (parsed.widgets as unknown[]).filter((w): w is string => typeof w === 'string' && valid.has(w)) : []
    return { widgets: widgets.length ? widgets : availableWidgets.map((w) => w.type).slice(0, 5), reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '' }
  }
}
