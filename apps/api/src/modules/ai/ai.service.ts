import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Anthropic from '@anthropic-ai/sdk'
import type { Response } from '@nestjs/common'
import { and, eq, gte, lte, ne, sql } from 'drizzle-orm'
import { aiUsage, workspaces, workspaceMembers, spaces, projects, lists, tasks, taskAssignees } from '@rundesk/db'
import type { Db } from '@rundesk/db'
import { DB_TOKEN } from '../../common/database/database.module'

export type AiCtx = { userId?: string; workspaceId?: string }

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
  async generateTask(prompt: string, context?: string, ctx: AiCtx = {}): Promise<{
    title: string
    description: string
    subtasks: string[]
    priority: 'urgent' | 'high' | 'normal' | 'low'
    estimatedHours?: number
  }> {
    const systemPrompt = `You are a project management assistant for Rundesk.
When given a natural language description, generate a structured task definition.
Respond ONLY with valid JSON matching this exact shape:
{
  "title": "string (concise, action-oriented)",
  "description": "string (detailed markdown description)",
  "subtasks": ["string", ...],
  "priority": "urgent" | "high" | "normal" | "low",
  "estimatedHours": number | null
}
${context ? `\nWorkspace context:\n${context}` : ''}`

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
   * Build a real workspace context string for the chatbot (Plan §7.6): the
   * user's role, space/project/task counts, and their open assigned tasks —
   * so answers are grounded instead of a workspace-ID stub.
   */
  async buildWorkspaceContext(workspaceId: string, userId: string): Promise<string> {
    try {
      const [[wsRow], [roleRow], [counts], openTasks] = await Promise.all([
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
            openTasks: sql<number>`count(distinct case when ${tasks.statusCategory} <> 'closed' and ${tasks.isArchived} = false then ${tasks.id} end)::int`,
          })
          .from(spaces)
          .leftJoin(projects, eq(projects.spaceId, spaces.id))
          .leftJoin(lists, eq(lists.projectId, projects.id))
          .leftJoin(tasks, eq(tasks.listId, lists.id))
          .where(eq(spaces.workspaceId, workspaceId)),
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
          .limit(15),
      ])
      const mine = openTasks
        .map((t) => `- ${t.title}${t.dueDate ? ` (due ${new Date(t.dueDate).toISOString().slice(0, 10)})` : ''} [${t.priority}]`)
        .join('\n')
      return [
        `Workspace: ${wsRow?.name ?? 'Unknown'}`,
        `Your role: ${roleRow?.role ?? 'member'}`,
        `Workspace totals: ${counts?.spaces ?? 0} spaces, ${counts?.projects ?? 0} projects, ${counts?.openTasks ?? 0} open tasks`,
        openTasks.length ? `Your open assigned tasks:\n${mine}` : 'You have no open assigned tasks.',
      ].join('\n')
    } catch {
      return `Workspace ID: ${workspaceId}`
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
