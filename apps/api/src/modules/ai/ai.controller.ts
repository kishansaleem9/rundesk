import { Body, Controller, Get, Patch, Post, Query, Res, UseGuards, HttpException, HttpStatus } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AiService, openSseStream } from './ai.service'
import { SkillsService } from '../skills/skills.service'
import { MODEL_TIERS } from './model-tiers'
import { BriefingService } from './briefing.service'
import type { PlanAction } from './ai-command'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { NotGuestGuard } from '../../common/guards/not-guest.guard'
import { PlanFeatureGuard } from '../plans/plan-feature.guard'
import { RequirePlan } from '../plans/require-plan.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { HELP_TOPICS } from './knowledge'

@ApiTags('ai')
@ApiBearerAuth()
// Plan §14.1: gate the whole AI surface on the workspace's plan `ai` feature.
// The guard resolves the workspaceId from the request body/query/param; when a
// gated request carries a workspaceId whose plan lacks AI it 403s, otherwise it's
// a no-op — and always a no-op for enterprise (every existing workspace).
@RequirePlan('ai')
@UseGuards(JwtAuthGuard, NotGuestGuard, PlanFeatureGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly briefings: BriefingService,
    private readonly skills: SkillsService,
  ) {}

  @Get('models')
  @ApiOperation({ summary: '§15 — the tiers the composer offers' })
  models() {
    return MODEL_TIERS
  }

  @Get('status')
  @ApiOperation({ summary: 'Check if AI features are available' })
  status() {
    return { available: this.ai.isAvailable() }
  }

  /**
   * §V2-11, frames `19:00`/`19:05` — what the AI was worth, beside what it cost.
   */
  @Get('value')
  @ApiOperation({ summary: 'AI value: runs, estimated time saved and its labour value' })
  value(
    @CurrentUser() user: any,
    @Query('workspaceId') workspaceId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const parse = (s?: string) => {
      if (!s) return undefined
      const d = new Date(s)
      return Number.isNaN(d.getTime()) ? undefined : d
    }
    return this.ai.valueSummary({
      workspaceId,
      from: parse(from),
      to: parse(to),
      actor: { id: user.id, role: user.role },
    })
  }

  /** §V2-11 — "Edit benchmark", frame `19:00`. Admin-only. */
  @Patch('value/benchmark')
  @ApiOperation({ summary: 'Set the minutes-saved-per-run and hourly rate the value panel reasons from' })
  updateBenchmark(
    @CurrentUser() user: any,
    @Query('workspaceId') workspaceId: string,
    @Body() body: { minutesSavedPerRun?: number; hourlyRateCents?: number },
  ) {
    return this.ai.updateValueBenchmark(workspaceId, { id: user.id, role: user.role }, body)
  }

  /**
   * §V2-11, frame `19:05` — the Activity log, one row per AI run.
   *
   * Filtered by when, which feature and whose. The frame's "Agent" filter has
   * no counterpart here on purpose: Rundesk has no agents, and a filter that
   * can only ever return everything is a control that lies about what it does.
   */
  @Get('activity')
  @ApiOperation({ summary: 'Individual AI runs, newest first' })
  activity(
    @CurrentUser() user: any,
    @Query('workspaceId') workspaceId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('feature') feature?: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
  ) {
    const parse = (s?: string) => {
      if (!s) return undefined
      const d = new Date(s)
      return Number.isNaN(d.getTime()) ? undefined : d
    }
    return this.ai.runLog({
      workspaceId,
      actor: { id: user.id, role: user.role },
      from: parse(from),
      to: parse(to),
      feature: feature || undefined,
      userId: userId || undefined,
      limit: limit ? Number(limit) : undefined,
    })
  }

  @Get('usage')
  @ApiOperation({ summary: 'AI usage + estimated cost per user / per model' })
  usage(
    @CurrentUser() user: any,
    @Query('workspaceId') workspaceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const parse = (s?: string) => {
      if (!s) return undefined
      const d = new Date(s)
      return Number.isNaN(d.getTime()) ? undefined : d
    }
    return this.ai.usageSummary({
      workspaceId,
      from: parse(from),
      to: parse(to),
      actor: { id: user.id, role: user.role },
    })
  }

  @Post('briefing')
  @ApiOperation({ summary: "Generate the caller's daily briefing now (§7.11 on demand)" })
  briefing(@CurrentUser() user: any) {
    // Always answers: generateBriefing falls back to the deterministic template
    // when no model is configured, so a run-now never dead-ends on a 503.
    return this.briefings.generateNow(user.id)
  }

  @Post('task/generate')
  @ApiOperation({ summary: 'Generate a task from a natural language prompt' })
  async generateTask(
    @CurrentUser() user: any,
    @Body()
    body: {
      prompt: string
      context?: string
      workspaceId?: string
      customFields?: Array<{ name: string; type: string; options?: string[] }>
    },
  ) {
    if (!this.ai.isAvailable()) {
      throw new HttpException('AI features are not configured', HttpStatus.SERVICE_UNAVAILABLE)
    }
    return this.ai.generateTask(
      body.prompt,
      body.context,
      { userId: user.id, workspaceId: body.workspaceId },
      body.customFields,
    )
  }

  @Post('task/priority')
  @ApiOperation({ summary: 'Suggest priority for a task' })
  async suggestPriority(
    @CurrentUser() user: any,
    @Body() body: { title: string; description?: string; workspaceId?: string },
  ) {
    if (!this.ai.isAvailable()) {
      throw new HttpException('AI features are not configured', HttpStatus.SERVICE_UNAVAILABLE)
    }
    return this.ai.suggestPriority(body.title, body.description, { userId: user.id, workspaceId: body.workspaceId })
  }

  @Post('task/deadline')
  @ApiOperation({ summary: 'Suggest a deadline for a task (factors in current team workload)' })
  async suggestDeadline(
    @CurrentUser() user: any,
    @Body() body: { title: string; description?: string; teamWorkload?: string; taskId?: string; workspaceId?: string },
  ) {
    if (!this.ai.isAvailable()) {
      throw new HttpException('AI features are not configured', HttpStatus.SERVICE_UNAVAILABLE)
    }
    // Factor in current team workload (Plan §7.4). Prefer a client-supplied
    // signal; otherwise enrich server-side from the task's assignees' open-task
    // counts (access-checked, like the summarize taskId path).
    let teamWorkload = body.teamWorkload
    if (!teamWorkload && body.taskId) {
      await this.ai.assertTaskWorkspaceAccess(body.taskId, user.id)
      teamWorkload = await this.ai.buildTeamWorkloadSignal(body.taskId)
    }
    return this.ai.suggestDeadline(body.title, body.description, teamWorkload, {
      userId: user.id,
      workspaceId: body.workspaceId,
    })
  }

  @Post('automation-suggestions')
  @ApiOperation({ summary: 'Suggest automation rules from recent workspace behavior (AI, with deterministic fallback)' })
  async automationSuggestions(@CurrentUser() user: any, @Body() body: { workspaceId?: string }) {
    if (!body?.workspaceId) {
      throw new HttpException('workspaceId is required', HttpStatus.BAD_REQUEST)
    }
    // Gate on workspace membership (the controller isn't workspace-scoped), then
    // return best-effort suggestions — the service never throws on AI failure.
    await this.ai.assertWorkspaceMember(body.workspaceId, user.id)
    return this.ai.suggestAutomations(body.workspaceId, { userId: user.id, workspaceId: body.workspaceId })
  }

  @Post('summarize')
  @ApiOperation({ summary: 'Summarize a task or project' })
  async summarize(
    @CurrentUser() user: any,
    @Body() body: { content?: string; taskId?: string; type?: 'task' | 'project'; workspaceId?: string },
  ) {
    if (!this.ai.isAvailable()) {
      throw new HttpException('AI features are not configured', HttpStatus.SERVICE_UNAVAILABLE)
    }
    // When a taskId is provided, enrich the input server-side (Plan §7.5) with
    // recent activity, open subtasks, open blockers, and recent comments — but
    // first assert the caller can access that task's workspace (Plan §7.5 hardening).
    if (body.taskId) await this.ai.assertTaskWorkspaceAccess(body.taskId, user.id)
    const content = body.taskId ? await this.ai.buildTaskSummaryInput(body.taskId) : body.content ?? ''
    const summary = await this.ai.summarize(content, body.type ?? 'task', {
      userId: user.id,
      workspaceId: body.workspaceId,
    })
    return { summary }
  }

  @Post('summarize/stream')
  @ApiOperation({ summary: 'Summarize a task or project (streaming SSE)' })
  async summarizeStream(
    @CurrentUser() user: any,
    @Body() body: { content?: string; taskId?: string; type?: 'task' | 'project'; workspaceId?: string },
    @Res() res: any,
  ) {
    if (!this.ai.isAvailable()) {
      res.status(503).send({ error: 'AI features are not configured' })
      return
    }
    // A task summary is enriched server-side from the task's recent activity,
    // open subtasks, blockers and comments; a project summary streams the
    // caller-provided report text (Plan §7.5). Assert task-workspace access
    // before reading a task by id (Plan §7.5 hardening).
    if (body.taskId) await this.ai.assertTaskWorkspaceAccess(body.taskId, user.id)
    const content = body.taskId ? await this.ai.buildTaskSummaryInput(body.taskId) : body.content ?? ''
    await this.ai.summarizeStream(content, body.type ?? 'task', res as any, {
      userId: user.id,
      workspaceId: body.workspaceId,
    })
  }

  @Post('writing/improve')
  @ApiOperation({ summary: 'Improve writing with AI' })
  async improveWriting(
    @CurrentUser() user: any,
    @Body() body: { text: string; mode?: 'improve' | 'shorten' | 'expand' | 'format'; workspaceId?: string },
  ) {
    if (!this.ai.isAvailable()) {
      throw new HttpException('AI features are not configured', HttpStatus.SERVICE_UNAVAILABLE)
    }
    const improved = await this.ai.improveWriting(body.text, body.mode ?? 'improve', {
      userId: user.id,
      workspaceId: body.workspaceId,
    })
    return { improved }
  }

  @Post('meeting-notes')
  @ApiOperation({ summary: 'Extract action items from meeting notes' })
  async extractFromNotes(@CurrentUser() user: any, @Body() body: { notes: string; workspaceId?: string }) {
    if (!this.ai.isAvailable()) {
      throw new HttpException('AI features are not configured', HttpStatus.SERVICE_UNAVAILABLE)
    }
    return this.ai.extractTasksFromNotes(body.notes, { userId: user.id, workspaceId: body.workspaceId })
  }

  @Post('insights')
  @ApiOperation({ summary: 'Generate AI insights from real workspace metrics' })
  async insights(@CurrentUser() user: any, @Body() body: { context: string; workspaceId?: string }) {
    if (!this.ai.isAvailable()) {
      throw new HttpException('AI features are not configured', HttpStatus.SERVICE_UNAVAILABLE)
    }
    return this.ai.generateInsights(body.context ?? '', { userId: user.id, workspaceId: body.workspaceId })
  }

  @Post('dashboard/suggest-layout')
  @ApiOperation({ summary: 'Suggest a dashboard widget layout with AI' })
  async suggestLayout(
    @CurrentUser() user: any,
    @Body() body: { availableWidgets: Array<{ type: string; label: string }>; context?: string; workspaceId?: string },
  ) {
    if (!this.ai.isAvailable()) {
      throw new HttpException('AI features are not configured', HttpStatus.SERVICE_UNAVAILABLE)
    }
    return this.ai.suggestDashboardLayout(body.availableWidgets ?? [], body.context ?? '', {
      userId: user.id,
      workspaceId: body.workspaceId,
    })
  }

  @Post('chat')
  @ApiOperation({ summary: 'Chat with AI assistant (streaming SSE)' })
  async chat(
    @CurrentUser() user: any,
    @Body()
    body: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      workspaceContext?: string
      workspaceId?: string
      currentView?: string
      /** §15 — answer as this skill. Ignored without a workspaceId. */
      skillId?: string
      /** §15 — 'fast' | 'deep'; anything else falls back to the default. */
      tier?: string
    },
    @Res() res: any,
  ) {
    if (!this.ai.isAvailable()) {
      res.status(503).send({ error: 'AI features are not configured' })
      return
    }
    /*
     * G13-10 [18:33–18:36] — say what is being read, while it is being read.
     *
     * Her frames show a status with the retrieval steps streaming beneath it
     * before any answer appears: "Checking what you're working on", "Checking
     * the latest Skills basics". Ours showed a blinking caret, so a turn that
     * spends several seconds inspecting a real workspace looked identical to
     * one doing nothing — and seeing that it read your actual data is the
     * whole trust signal.
     *
     * The stream opens HERE rather than inside chatStream, because the work
     * worth reporting happens before the model is called. Each step is written
     * immediately before the operation it names, so the trace is a record of
     * work rather than decoration: skip buildWorkspaceContext and its line
     * never appears.
     */
    /*
     * §15 — resolved BEFORE the stream opens, and that ordering is the point.
     *
     * The skill is resolved through SkillsService rather than by reading the
     * row here: the service owns the visibility filter and the enabled check,
     * so going through it is what stops a caller invoking a skill they cannot
     * see, or one its owner has switched off. A skillId without a workspaceId
     * is not resolvable at all — the id alone names nothing this endpoint may
     * open.
     *
     * This used to sit below, after the stream had been opened, and the
     * refusal had to go down the stream as an error frame because
     * `res.status().send()` throws once headers have flushed. It failed closed,
     * which was the important half — but the CALLER saw HTTP 201 and had to
     * read the body to discover it had been refused, which is not what a
     * status code is for. A deployed-app check asserting the 4xx read that 201
     * as "a disabled skill was accepted", and could not have read it any other
     * way.
     *
     * Resolving first costs one await before the first byte, only on a request
     * that names a skill, and lets the refusal be an ordinary 400/404 again.
     * The exception is left to propagate rather than caught: the service
     * already throws the right ones, and the headers have not been sent yet.
     */
    let skillPrompt: string | undefined
    if (body.skillId && body.workspaceId) {
      const invocation = await this.skills.buildInvocationContext(
        body.workspaceId,
        user.id,
        body.skillId,
      )
      skillPrompt = this.skills.renderSkillPrompt(invocation)
    }

    const stream = openSseStream(res)
    const step = (name: string) => stream.write(`data: ${JSON.stringify({ step: name })}\n\n`)

    let context: string
    if (body.workspaceId) {
      step('workspace')
      context = await this.ai.buildWorkspaceContext(body.workspaceId, user.id, {
        currentView: body.currentView,
      })
    } else {
      context = body.workspaceContext ?? ''
    }

    // The trace still names the skill, in the place it always appeared. It
    // reports work already done rather than announcing work about to start —
    // the one step here that does, because a refusal has to be answerable with
    // a status code and that has to happen before anything is written.
    if (skillPrompt) step('skill')

    await this.ai.chatStream(
      body.messages,
      context,
      res as any,
      { userId: user.id, workspaceId: body.workspaceId },
      skillPrompt,
      body.tier,
      stream,
    )
  }

  @Post('suggest-tasks')
  @ApiOperation({ summary: 'Suggest a task list for a project by learning from similar projects (AI, deterministic fallback)' })
  async suggestTasks(
    @CurrentUser() user: any,
    @Body() body: { workspaceId?: string; projectId?: string; projectName?: string; description?: string },
  ) {
    if (!body?.workspaceId) {
      throw new HttpException('workspaceId is required', HttpStatus.BAD_REQUEST)
    }
    // Gate on membership (controller isn't workspace-scoped); the service is
    // best-effort and never throws on AI failure.
    await this.ai.assertWorkspaceMember(body.workspaceId, user.id)
    return this.ai.suggestTasks(
      {
        workspaceId: body.workspaceId,
        projectId: body.projectId,
        projectName: body.projectName,
        description: body.description,
      },
      { userId: user.id, workspaceId: body.workspaceId },
    )
  }

  @Post('workload-balance')
  @ApiOperation({ summary: 'Suggest workload redistribution from real per-assignee load (AI, deterministic fallback)' })
  async workloadBalance(@CurrentUser() user: any, @Body() body: { workspaceId?: string }) {
    if (!body?.workspaceId) {
      throw new HttpException('workspaceId is required', HttpStatus.BAD_REQUEST)
    }
    await this.ai.assertWorkspaceMember(body.workspaceId, user.id)
    return this.ai.workloadBalance(body.workspaceId, { userId: user.id, workspaceId: body.workspaceId })
  }

  @Post('workload-balance/execute')
  @ApiOperation({ summary: 'Execute confirmed workload moves (manager/admin only; reassigns via TasksService)' })
  async workloadBalanceExecute(
    @CurrentUser() user: any,
    @Body() body: { workspaceId?: string; moves?: Array<{ fromUserId: string; toUserId: string; taskIds: string[] }> },
  ) {
    if (!body?.workspaceId) {
      throw new HttpException('workspaceId is required', HttpStatus.BAD_REQUEST)
    }
    // Reassignment is a privileged action — managers/admins only.
    await this.ai.assertWorkspaceManager(body.workspaceId, user.id)
    return this.ai.executeWorkloadBalance(body.workspaceId, Array.isArray(body?.moves) ? body.moves : [], user.id)
  }

  @Post('knowledge')
  @ApiOperation({ summary: 'Ask the workspace knowledge base (retrieval over accessible content; deterministic fallback)' })
  async knowledge(@CurrentUser() user: any, @Body() body: { workspaceId?: string; question?: string }) {
    if (!body?.workspaceId || !body?.question?.trim()) {
      throw new HttpException('workspaceId and question are required', HttpStatus.BAD_REQUEST)
    }
    // Gate on workspace membership (the controller isn't workspace-scoped);
    // retrieval further scopes to content the caller can access. Best-effort —
    // the service never throws on AI failure (deterministic search fallback).
    await this.ai.assertWorkspaceMember(body.workspaceId, user.id)
    const answer = await this.ai.answerKnowledge(body.workspaceId, user.id, body.question, {
      userId: user.id,
      workspaceId: body.workspaceId,
    })
    /*
     * §G02 — the thumbs come back WITH the answer.
     *
     * The palette caches an answer for five minutes and is torn down on every
     * close, so a rating fetched separately would be a second round trip that
     * usually arrives after the person has already looked away. Riding along
     * costs one indexed lookup and means a thumb that was pressed yesterday is
     * lit the moment the answer appears.
     */
    const feedback = await this.ai.getAnswerFeedback(body.workspaceId, user.id, body.question)
    return { ...answer, feedback }
  }

  @Patch('knowledge/feedback')
  @ApiOperation({ summary: '§G02 — thumbs up / down on a palette answer; the same one again clears it' })
  async knowledgeFeedback(
    @CurrentUser() user: any,
    @Body() body: { workspaceId?: string; question?: string; feedback?: 'up' | 'down' | null },
  ) {
    if (!body?.workspaceId || !body?.question?.trim()) {
      throw new HttpException('workspaceId and question are required', HttpStatus.BAD_REQUEST)
    }
    await this.ai.assertWorkspaceMember(body.workspaceId, user.id)
    const value = body.feedback
    return this.ai.setAnswerFeedback(
      body.workspaceId,
      user.id,
      body.question,
      value === 'up' || value === 'down' ? value : null,
    )
  }

  /*
   * The help library, served rather than restated.
   *
   * `answerHelp` cites its sources as `/app/help#help-<id>`, but the page hand
   * wrote four cards out of ten topics — so for the other six the assistant
   * cited an anchor that did not exist, and clicking it did nothing at all.
   * The page now renders one card per topic from this list, which is the only
   * arrangement in which a citation cannot point at nothing.
   *
   * Keywords are deliberately not returned: they are matching fuel for the
   * fallback, not something to show anybody.
   */
  @Get('help/topics')
  @ApiOperation({ summary: 'The curated help topics the assistant answers from, for the help library' })
  helpTopics() {
    return HELP_TOPICS.map(({ id, question, answer }) => ({ id, question, answer }))
  }

  @Post('help')
  @ApiOperation({ summary: 'Ask the AI help assistant (grounded in the curated FAQ; deterministic keyword fallback)' })
  async help(@CurrentUser() user: any, @Body() body: { question?: string }) {
    if (!body?.question?.trim()) {
      throw new HttpException('question is required', HttpStatus.BAD_REQUEST)
    }
    // Help is product-wide (no workspace) — the PlanFeatureGuard is a no-op
    // without a workspaceId. Best-effort: always answers via the FAQ fallback.
    return this.ai.answerHelp(body.question, { userId: user.id })
  }

  @Post('skills/propose')
  @ApiOperation({
    summary: '§15 — draft a skill from a sentence (SSE; proposal only, nothing is written)',
  })
  async proposeSkill(
    @CurrentUser() user: any,
    @Body() body: { workspaceId?: string; request?: string },
    @Res() res: any,
  ) {
    if (!body.workspaceId) {
      throw new HttpException('workspaceId is required', HttpStatus.BAD_REQUEST)
    }
    const request = (body.request ?? '').trim()
    if (!request) {
      throw new HttpException('Say what the skill should do', HttpStatus.BAD_REQUEST)
    }

    // Streamed, because the steps are the point: frame `t1138` shows "Mapping
    // your task habits" and "Checking task-organizing best practices" arriving
    // *before* the answer. Collecting them and sending the lot at the end would
    // render the same words with none of the meaning — the person would learn
    // what was read only after they had already been shown the conclusion.
    //
    // Same Fastify hijack as chatStream: reply.raw is the Node response.
    const reply = res as any
    if (typeof reply.hijack === 'function') reply.hijack()
    const raw = reply.raw ?? reply
    raw.setHeader('Content-Type', 'text/event-stream')
    raw.setHeader('Cache-Control', 'no-cache')
    raw.setHeader('Connection', 'keep-alive')
    raw.flushHeaders?.()

    try {
      // Deliberately NOT gated on isAvailable(): the proposer has a real
      // deterministic draft for an instance with no key, and it says so in its
      // own rationale rather than pretending it read the workspace.
      const result = await this.ai.proposeSkill(
        body.workspaceId,
        user.id,
        request,
        { userId: user.id, workspaceId: body.workspaceId },
        (step) => raw.write(`data: ${JSON.stringify({ step })}\n\n`),
      )
      raw.write(`data: ${JSON.stringify(result)}\n\n`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not draft a skill'
      raw.write(`data: ${JSON.stringify({ error: message })}\n\n`)
    } finally {
      raw.write('data: [DONE]\n\n')
      raw.end()
    }
  }

  @Post('skills/mine')
  @ApiOperation({
    summary: '§15 Skills Miner — scan real work for repeated workflows (SSE; writes nothing)',
  })
  async mineSkills(
    @CurrentUser() user: any,
    @Body() body: { workspaceId?: string },
    @Res() res: any,
  ) {
    if (!body.workspaceId) {
      throw new HttpException('workspaceId is required', HttpStatus.BAD_REQUEST)
    }

    // Streamed for the same reason as the drafter: the scans are the claim, so
    // they arrive before the conclusion rather than alongside it.
    const reply = res as any
    if (typeof reply.hijack === 'function') reply.hijack()
    const raw = reply.raw ?? reply
    raw.setHeader('Content-Type', 'text/event-stream')
    raw.setHeader('Cache-Control', 'no-cache')
    raw.setHeader('Connection', 'keep-alive')
    raw.flushHeaders?.()

    try {
      const result = await this.ai.mineSkills(
        body.workspaceId,
        user.id,
        { userId: user.id, workspaceId: body.workspaceId },
        (step) => raw.write(`data: ${JSON.stringify({ step })}\n\n`),
      )
      raw.write(`data: ${JSON.stringify(result)}\n\n`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not scan your work'
      raw.write(`data: ${JSON.stringify({ error: message })}\n\n`)
    } finally {
      raw.write('data: [DONE]\n\n')
      raw.end()
    }
  }

  @Post('command')
  @ApiOperation({ summary: 'Plan a natural-language command via tool use (preview, nothing mutates)' })
  async command(@CurrentUser() user: any, @Body() body: { workspaceId?: string; message?: string }) {
    if (!this.ai.isAvailable()) {
      throw new HttpException('AI features are not configured', HttpStatus.SERVICE_UNAVAILABLE)
    }
    if (!body?.workspaceId || !body?.message?.trim()) {
      throw new HttpException('workspaceId and message are required', HttpStatus.BAD_REQUEST)
    }
    return this.ai.command(body.workspaceId, body.message, { userId: user.id, workspaceId: body.workspaceId })
  }

  @Post('command/execute')
  @ApiOperation({ summary: 'Execute confirmed command actions (per-action, access-checked)' })
  async commandExecute(
    @CurrentUser() user: any,
    @Body() body: { workspaceId?: string; actions?: PlanAction[] },
  ) {
    // No model call — pure task mutations via TasksService, each access-checked.
    return this.ai.executeActions(Array.isArray(body?.actions) ? body.actions : [], user.id)
  }
}
