import { Body, Controller, Get, Post, Query, Res, UseGuards, HttpException, HttpStatus } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AiService } from './ai.service'
import { SkillsService } from '../skills/skills.service'
import { BriefingService } from './briefing.service'
import type { PlanAction } from './ai-command'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { NotGuestGuard } from '../../common/guards/not-guest.guard'
import { PlanFeatureGuard } from '../plans/plan-feature.guard'
import { RequirePlan } from '../plans/require-plan.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

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

  @Get('status')
  @ApiOperation({ summary: 'Check if AI features are available' })
  status() {
    return { available: this.ai.isAvailable() }
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
    },
    @Res() res: any,
  ) {
    if (!this.ai.isAvailable()) {
      res.status(503).send({ error: 'AI features are not configured' })
      return
    }
    // Real context injection (§7.6): build a grounded workspace summary
    // server-side when a workspaceId is provided, passing the caller's optional
    // current-view hint (§7.15) so answers reflect where the user is.
    const context = body.workspaceId
      ? await this.ai.buildWorkspaceContext(body.workspaceId, user.id, { currentView: body.currentView })
      : body.workspaceContext ?? ''

    // §15 — resolve the skill through SkillsService rather than reading the row
    // here. The service owns the visibility filter and the enabled check, so
    // going through it is what stops a caller invoking a skill they cannot see,
    // or one its owner has switched off. A skillId without a workspaceId is not
    // resolvable at all: the id alone names nothing this endpoint may open.
    let skillPrompt: string | undefined
    if (body.skillId && body.workspaceId) {
      try {
        const invocation = await this.skills.buildInvocationContext(
          body.workspaceId,
          user.id,
          body.skillId,
        )
        skillPrompt = this.skills.renderSkillPrompt(invocation)
      } catch (err) {
        // Failing closed matters more than streaming something: silently
        // answering as the generic assistant would look like the skill worked.
        const status = err instanceof HttpException ? err.getStatus() : HttpStatus.BAD_REQUEST
        res.status(status).send({
          error: err instanceof Error ? err.message : 'Skill unavailable',
        })
        return
      }
    }

    await this.ai.chatStream(
      body.messages,
      context,
      res as any,
      { userId: user.id, workspaceId: body.workspaceId },
      skillPrompt,
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
    return this.ai.answerKnowledge(body.workspaceId, user.id, body.question, {
      userId: user.id,
      workspaceId: body.workspaceId,
    })
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
