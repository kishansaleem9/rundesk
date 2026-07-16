import { Body, Controller, Get, Post, Query, Res, UseGuards, HttpException, HttpStatus } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AiService } from './ai.service'
import type { PlanAction } from './ai-command'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { NotGuestGuard } from '../../common/guards/not-guest.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, NotGuestGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('status')
  @ApiOperation({ summary: 'Check if AI features are available' })
  status() {
    return { available: this.ai.isAvailable() }
  }

  @Get('usage')
  @ApiOperation({ summary: 'AI usage + estimated cost per user / per model' })
  usage(
    @Query('workspaceId') workspaceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const parse = (s?: string) => {
      if (!s) return undefined
      const d = new Date(s)
      return Number.isNaN(d.getTime()) ? undefined : d
    }
    return this.ai.usageSummary({ workspaceId, from: parse(from), to: parse(to) })
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
    await this.ai.chatStream(body.messages, context, res as any, {
      userId: user.id,
      workspaceId: body.workspaceId,
    })
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
