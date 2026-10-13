import { Body, Controller, Get, HttpCode, Patch, Post, Put, Query, Res, UseGuards, HttpException, HttpStatus } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AiService, endSseWithError, openSseStream, type AiRunStatus } from './ai.service'
import { SkillsService } from '../skills/skills.service'
import { BEST_MODELS_VISIBLE, MODEL_TIERS, UNROUTABLE_PROVIDERS, splitPickerModels } from './model-tiers'
import { isStarterSurface } from './ai-starters'
import { BriefingService } from './briefing.service'
import type { PlanAction } from './ai-command'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { PlanFeatureGuard } from '../plans/plan-feature.guard'
import { NamedWorkspaceMemberGuard } from '../auth/guards/named-workspace-member.guard'
import { RequirePlan } from '../plans/require-plan.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { HELP_TOPICS } from './knowledge'
import { IMAGE_PROMPT_MAX, IMAGE_SIZES, IMAGES_PER_ASK, imageFileName, type ImageSize } from './image-generation'
import { readComposerFiles, withComposerFiles } from './composer-files'

@ApiTags('ai')
@ApiBearerAuth()
// Plan §14.1: gate the whole AI surface on the workspace's plan `ai` feature.
// The guard resolves the workspaceId from the request body/query/param; when a
// gated request carries a workspaceId whose plan lacks AI it 403s, otherwise it's
// a no-op — and always a no-op for enterprise (every existing workspace).
@RequirePlan('ai')
// NamedWorkspaceMemberGuard: every route here takes the workspace in its body
// or query, and nothing checked the caller belonged to it (see the guard). It
// refuses the workspace's guests by their role there; the account's own role
// decides nothing (`guest-guard-reads-the-account-role`).
@UseGuards(JwtAuthGuard, NamedWorkspaceMemberGuard, PlanFeatureGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly briefings: BriefingService,
    private readonly skills: SkillsService,
  ) {}

  /**
   * §V2-S18, frame `[17:16]` — what the composer's picker is allowed to offer.
   *
   * TWO LISTS, NOT ONE LIST WITH A FLAG. `models` is what this server can
   * actually route to; `unavailable` is what the frame names and this product
   * has no client for. They are separate shapes so no rewrite of the picker can
   * accidentally hand an unroutable id to `modelForTier` — the unroutable shape
   * has no field to put a model in.
   *
   * The unavailable entries carry a translation KEY, not a sentence: this is
   * read by a person in four locales.
   *
   * `models` stays the WHOLE routable catalogue, because it is also what the
   * preference write is validated against. `best` / `more` is the same list cut
   * where `[17:16]` cuts it — served rather than re-derived in the browser, so
   * the bound on the visible group has exactly one definition.
   */
  @Get('models')
  @ApiOperation({ summary: '§15 — the tiers the composer offers, and the ones it cannot' })
  models() {
    const { best, more } = splitPickerModels(MODEL_TIERS)
    return {
      models: MODEL_TIERS,
      best,
      more,
      visible: BEST_MODELS_VISIBLE,
      unavailable: UNROUTABLE_PROVIDERS,
    }
  }

  /**
   * §V2-S18 `[17:28]`–`[17:32]` — "apna [preferred] AI bhi set down karna hai."
   *
   * The preference was `localStorage` only (`rundesk.aiTier`), which is a
   * per-browser habit rather than a setting: it did not follow anybody to a
   * second machine. It is a row now, per person per workspace.
   */
  @Get('preferences')
  @ApiOperation({ summary: 'The signed-in person’s preferred model tier for this workspace' })
  modelPreference(@CurrentUser() user: any, @Query('workspaceId') workspaceId: string) {
    return this.ai.modelPreference(user.id, workspaceId)
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Set the preferred model tier for this workspace' })
  setModelPreference(
    @CurrentUser() user: any,
    @Query('workspaceId') workspaceId: string,
    @Body() body: { preferredTier?: string },
  ) {
    // Refused rather than coerced when it is not a routable tier — see
    // `setModelPreference`. A stored "gemini" nothing can run is worse than
    // refusing the write.
    return this.ai.setModelPreference(user.id, workspaceId, body?.preferredTier ?? '')
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
   * The frame's filter row is `Date run ▾ · Status ▾ · My agents · Agent ▾`.
   *
   * `userId` HAS BEEN ACCEPTED HERE SINCE THIS ENDPOINT WAS WRITTEN and the web
   * client never sent it, so the "mine only" toggle re-rendered and asked the
   * server for exactly the same rows — a UI-only build, and a live defect
   * rather than a missing feature. The client sends it now.
   *
   * `status` is new, and could not have existed before migration 0150: nothing
   * wrote a failed run, so the filter would have had one reachable value.
   *
   * The frame's "Agent" filter still has no counterpart, on purpose. Rundesk
   * has no agents, and a filter that can only ever return everything is a
   * control that lies about what it does.
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
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    const parse = (s?: string) => {
      if (!s) return undefined
      const d = new Date(s)
      return Number.isNaN(d.getTime()) ? undefined : d
    }
    /*
     * An unrecognised status is dropped rather than passed through. Passed
     * through it matches nothing, and an empty list is how somebody concludes
     * they have no failed runs when what they actually have is a typo in a
     * query string.
     */
    const runStatus: AiRunStatus | undefined =
      status === 'succeeded' || status === 'failed' ? status : undefined
    return this.ai.runLog({
      workspaceId,
      actor: { id: user.id, role: user.role },
      from: parse(from),
      to: parse(to),
      feature: feature || undefined,
      userId: userId || undefined,
      status: runStatus,
      limit: limit ? Number(limit) : undefined,
    })
  }

  /**
   * THE WORKSPACE'S AI CREDITS (`commit-log/log-3943965-1`, `ledger-rows/row-869`):
   * this month's allowance, use, what is left and when it renews; each day's
   * use against the limit; and what each category used. Every member reads it,
   * as ClickUp's AI hub shows used and remaining to all.
   */
  @Get('credits')
  @ApiOperation({ summary: 'This month’s AI credits for a workspace' })
  credits(@Query('workspaceId') workspaceId?: string) {
    if (!workspaceId) throw new HttpException('workspaceId is required', HttpStatus.BAD_REQUEST)
    return this.ai.creditsSummary(workspaceId)
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
    await this.ai.assertAvailable('task.generate', { userId: user.id, workspaceId: body.workspaceId })
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
    await this.ai.assertAvailable('task.priority', { userId: user.id, workspaceId: body.workspaceId })
    return this.ai.suggestPriority(body.title, body.description, { userId: user.id, workspaceId: body.workspaceId })
  }

  @Post('task/deadline')
  @ApiOperation({ summary: 'Suggest a deadline for a task (factors in current team workload)' })
  async suggestDeadline(
    @CurrentUser() user: any,
    @Body() body: { title: string; description?: string; teamWorkload?: string; taskId?: string; workspaceId?: string },
  ) {
    // A task named by id is asked for by someone who may open it, before
    // anything else — the model's availability included — so a refusal reads
    // the same with a model or without (`ai-task-paths-skip-the-read-rule`).
    if (body.taskId) await this.ai.assertTaskReadable(body.taskId, { id: user.id, role: user.role })
    await this.ai.assertAvailable('task.deadline', { userId: user.id, workspaceId: body.workspaceId })
    // Factor in current team workload (Plan §7.4). Prefer a client-supplied
    // signal; otherwise enrich server-side from the task's assignees' open-task
    // counts, of the tasks the asker may open.
    let teamWorkload = body.teamWorkload
    if (!teamWorkload && body.taskId) {
      teamWorkload = await this.ai.buildTeamWorkloadSignal(body.taskId, { id: user.id, role: user.role })
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

  /**
   * `ledger-rows/row-870` — pictures of a prompt, for a comment or a message
   * (ClickUp's "Generate images with Brain AI": from the comment box or a Chat
   * message, up to ten for a prompt; here up to four). They come back as data,
   * and the composer attaches them the way it attaches any file.
   */
  @Post('images')
  @ApiOperation({ summary: 'Pictures of a prompt (ledger-rows/row-870)' })
  async images(
    @CurrentUser() user: any,
    @Body() body: { workspaceId?: string; prompt?: unknown; count?: unknown; size?: unknown },
  ) {
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    if (!prompt) throw new HttpException('Describe the image to make', HttpStatus.BAD_REQUEST)
    if (prompt.length > IMAGE_PROMPT_MAX) throw new HttpException(`A description is ${IMAGE_PROMPT_MAX} characters at most`, HttpStatus.BAD_REQUEST)
    const count = body.count === undefined ? 1 : Number(body.count)
    if (!Number.isInteger(count) || count < 1 || count > IMAGES_PER_ASK) {
      throw new HttpException(`Make from 1 to ${IMAGES_PER_ASK} images at a time`, HttpStatus.BAD_REQUEST)
    }
    const size = (body.size === undefined ? '1024x1024' : body.size) as ImageSize
    if (!(IMAGE_SIZES as readonly unknown[]).includes(size)) {
      throw new HttpException(`The size is one of ${IMAGE_SIZES.join(', ')}`, HttpStatus.BAD_REQUEST)
    }
    const made = await this.ai.makeImages(prompt, count, size, { userId: user.id, workspaceId: body.workspaceId })
    return {
      model: made.model,
      images: made.images.map((im, i) => ({ fileName: imageFileName(prompt, i), mime: im.mime, dataUrl: `data:${im.mime};base64,${im.b64}` })),
    }
  }

  /**
   * Brain on a task's comments, "craft a reply" (help centre, "Use Brain on
   * task comments"; `found-29-sep/task-brain-offers-list-starters`): a reply
   * drafted from the task and its thread. The task rule first, before whether
   * a model is configured, as Summarize asks it.
   */
  @Post('comment-reply')
  @ApiOperation({ summary: 'Draft a reply to a task comment thread' })
  async commentReply(
    @CurrentUser() user: any,
    @Body() body: { taskId?: string; workspaceId?: string; instruction?: string },
  ) {
    if (!body.taskId) throw new HttpException('taskId is required', HttpStatus.BAD_REQUEST)
    await this.ai.assertTaskReadable(body.taskId, { id: user.id, role: user.role })
    await this.ai.assertAvailable('comment.reply', { userId: user.id, workspaceId: body.workspaceId })
    const content = await this.ai.buildTaskSummaryInput(body.taskId)
    const instruction = typeof body.instruction === 'string' ? body.instruction.trim().slice(0, 500) : ''
    const reply = await this.ai.draftCommentReply(content, instruction, { userId: user.id, workspaceId: body.workspaceId })
    return { reply }
  }

  @Post('summarize')
  @ApiOperation({ summary: 'Summarize a task or project' })
  async summarize(
    @CurrentUser() user: any,
    @Body() body: { content?: string; taskId?: string; type?: 'task' | 'project'; workspaceId?: string },
  ) {
    // When a taskId is provided, the input is built server-side (Plan §7.5)
    // from the task's recent activity, open subtasks, open blockers and recent
    // comments — so first, before the model's availability, the caller must be
    // one who may open that task (`ai-task-paths-skip-the-read-rule`).
    if (body.taskId) await this.ai.assertTaskReadable(body.taskId, { id: user.id, role: user.role })
    await this.ai.assertAvailable('summarize', { userId: user.id, workspaceId: body.workspaceId })
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
    // Before the model's availability, as the summary asks it: a task named by
    // id is summarised only for someone who may open it.
    if (body.taskId) await this.ai.assertTaskReadable(body.taskId, { id: user.id, role: user.role })
    if (!this.ai.isAvailable()) {
      // §V2-11 — recorded before the 503, like `assertAvailable`. This route
      // owns its own response (it streams), so it sends rather than throws.
      await this.ai.recordFailure('summarize', 'none', { userId: user.id, workspaceId: body.workspaceId }, 'not_configured', 'AI features are not configured')
      res.status(503).send({ error: 'AI features are not configured' })
      return
    }
    // A task summary is enriched server-side from the task's recent activity,
    // open subtasks, blockers and comments; a project summary streams the
    // caller-provided report text (Plan §7.5).
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
    await this.ai.assertAvailable('writing.improve', { userId: user.id, workspaceId: body.workspaceId })
    const improved = await this.ai.improveWriting(body.text, body.mode ?? 'improve', {
      userId: user.id,
      workspaceId: body.workspaceId,
    })
    return { improved }
  }

  @Post('meeting-notes')
  @ApiOperation({ summary: 'Extract action items from meeting notes' })
  async extractFromNotes(@CurrentUser() user: any, @Body() body: { notes: string; workspaceId?: string }) {
    await this.ai.assertAvailable('meeting.notes', { userId: user.id, workspaceId: body.workspaceId })
    return this.ai.extractTasksFromNotes(body.notes, { userId: user.id, workspaceId: body.workspaceId })
  }

  @Post('insights')
  @ApiOperation({ summary: 'Generate AI insights from real workspace metrics' })
  async insights(@CurrentUser() user: any, @Body() body: { context: string; workspaceId?: string }) {
    await this.ai.assertAvailable('insights', { userId: user.id, workspaceId: body.workspaceId })
    return this.ai.generateInsights(body.context ?? '', { userId: user.id, workspaceId: body.workspaceId })
  }

  @Post('dashboard/suggest-layout')
  @ApiOperation({ summary: 'Suggest a dashboard widget layout with AI' })
  async suggestLayout(
    @CurrentUser() user: any,
    @Body() body: { availableWidgets: Array<{ type: string; label: string }>; context?: string; workspaceId?: string },
  ) {
    await this.ai.assertAvailable('dashboard.layout', { userId: user.id, workspaceId: body.workspaceId })
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
      /**
       * The task the dock is pointed at (Brain² in the task header). Its
       * contents are read into the context, as Summarize reads them
       * (`found-29-sep/ai-chat-takes-no-task`).
       */
      taskId?: string
      /**
       * `ledger-rows/row-853` — the composer's "+": the tasks, Docs and
       * locations the person pointed Brain at, and the files they gave it.
       */
      focus?: unknown
      files?: unknown
    },
    @Res() res: any,
  ) {
    /*
     * A TASK THE TURN IS ABOUT is asked about first, before whether a model is
     * configured, as Summarize asks it: the reader may open it, and it is in
     * the workspace the turn names. A refusal is then a status code, the same
     * on every instance, and nothing has been streamed.
     */
    if (body.taskId) {
      const taskWorkspace = await this.ai.assertTaskReadable(body.taskId, { id: user.id, role: user.role })
      if (body.workspaceId && taskWorkspace !== body.workspaceId) {
        throw new HttpException('That task is not in this workspace', HttpStatus.BAD_REQUEST)
      }
    }
    /*
     * `ledger-rows/row-853` — AND SO IS WHAT THE COMPOSER'S "+" GAVE IT: each item
     * read as its asker may read it, each file read or refused by its name, all
     * before the model is asked whether it is there — the refusal is a status
     * code, and nothing has been streamed.
     */
    let focusText = ''
    if (body.focus != null) {
      if (!body.workspaceId) throw new HttpException('Say which workspace the items are in', HttpStatus.BAD_REQUEST)
      focusText = await this.ai.focusContext(body.workspaceId, { id: user.id, role: user.role }, body.focus)
    }
    const files = readComposerFiles(body.files)
    /*
     * AND WHETHER THIS TURN MAY BE ASKED AT ALL, before the stream opens: the
     * hour's limits and the month's credits, the credits whatever the server
     * has, as `assertAvailable` asks them. They were asked inside `chatStream`,
     * after the stream below had opened — and an open stream is a hijacked
     * reply, so the 429 or 402 they threw was sent to nobody. The turn stood on
     * a 201 with no frame until its client gave up, five minutes for a fetch,
     * and the composer said Brain was answering all the while
     * (`found-13-oct/a-refused-chat-turn-never-ends`).
     */
    const asker = { userId: user.id, workspaceId: body.workspaceId }
    await this.ai.assertWithinRateLimit(asker, new Date(), 'chat')
    if (!this.ai.isAvailable()) {
      // §V2-11 — recorded before the 503, like `assertAvailable`. This route
      // owns its own response (it streams), so it sends rather than throws.
      await this.ai.recordFailure('chat', 'none', asker, 'not_configured', 'AI features are not configured')
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

    // Past this line nothing may throw unsaid: the reply is hijacked, and an
    // exception would reach nobody (`found-13-oct/a-refused-chat-turn-never-ends`).
    try {
      let context: string
      if (body.workspaceId) {
        step('workspace')
        context = await this.ai.buildWorkspaceContext(body.workspaceId, user.id, {
          currentView: body.currentView,
        })
      } else {
        context = body.workspaceContext ?? ''
      }

      // ClickUp's Brain opened from a task reads that task: its description,
      // status, recent activity, open subtasks and blockers, and comments — the
      // input Summarize already builds, under a heading that says what it is.
      if (body.taskId) {
        step('task')
        const taskInput = await this.ai.buildTaskSummaryInput(body.taskId)
        context = `${context}\n\nThe task this conversation is about:\n${taskInput}`
      }

      // What the "+" pointed Brain at, under headings that say what each one is.
      if (focusText) {
        step('focus')
        context = `${context}\n\n${focusText}`
      }
      if (files.length) step('files')

      // The trace still names the skill, in the place it always appeared. It
      // reports work already done rather than announcing work about to start —
      // the one step here that does, because a refusal has to be answerable with
      // a status code and that has to happen before anything is written.
      if (skillPrompt) step('skill')

      /*
       * §V2-S16 `[17:44]`–`[18:48]` — the actor the container tools act as.
       *
       * Passed ONLY when the request names a workspace, because a tool that
       * writes has to write somewhere and a chat turn with a pasted context names
       * nothing. `chatStream` refuses the tools again on its own side when a
       * skill is answering; both checks are cheap and the cost of getting this
       * one wrong is a container created by a turn nobody could see the steps of.
       */
      await this.ai.chatStream(
        withComposerFiles(body.messages, files),
        context,
        res as any,
        { userId: user.id, workspaceId: body.workspaceId },
        skillPrompt,
        body.tier,
        stream,
        body.workspaceId ? { workspaceId: body.workspaceId, userId: user.id } : undefined,
      )
    } catch (err) {
      endSseWithError(stream, err)
    }
  }

  /**
   * §V2-S16 frame `20:10` — what an inline `[[task:…]]` / `[[list:…]]` chip in
   * an answer resolves to, in one round trip for the whole answer.
   *
   * A POST because the id list is a body, not a URL: an answer can mention
   * dozens of tasks and a query string is the wrong shape for that. It reads
   * nothing and writes nothing — the service applies the same per-item
   * visibility filter the rest of the product uses, and anything the caller may
   * not see simply does not come back, so the panel renders the reference as
   * plain text instead of as a chip that leaks a title.
   */
  /**
   * §V2-S17/S22 frames `16:32` / `21:15` — the four starter cards.
   *
   * A READ, and one whose answer is allowed to be different every time it is
   * asked: the cards turn on how much of your own work is overdue, which is a
   * fact that moves. `facts` and each card's `because` come back with the cards
   * so the caller — and a check — can see WHAT chose them rather than only
   * THAT something did. A row of four buttons is exactly the shape a facade
   * takes here; the reasons are what make the difference observable.
   */
  @Get('starters')
  @ApiOperation({ summary: '§V2-S17 — starter cards for this person, on this surface, now' })
  async starters(
    @CurrentUser() user: any,
    @Query('workspaceId') workspaceId: string,
    @Query('surface') surface?: string,
  ) {
    if (!workspaceId) {
      throw new HttpException('workspaceId is required', HttpStatus.BAD_REQUEST)
    }
    await this.ai.assertWorkspaceMember(workspaceId, user.id)
    // An unknown surface falls back to the workspace one rather than 400ing: a
    // stale client asking for a surface a newer server renamed should still get
    // four usable cards, and the surface only ever ADDS a card.
    return this.ai.starterCardsFor(
      workspaceId,
      user.id,
      isStarterSurface(surface) ? surface : 'workspace',
      user.role,
    )
  }

  /**
   * §V2-S17 frame `15:50` — **"⚡ Assign with AI"**, as an answerable question.
   *
   * A READ that recommends and does not write: the assignment still goes
   * through `assign_task`. Exposed on its own route rather than only through
   * the chat tool because the assignee picker is a menu, not a conversation —
   * pressing the frame's item should not have to open a chat to get an answer
   * — and because a recommendation whose reasoning can only be seen by reading
   * a model's prose is not checkable.
   *
   * NO PROVIDER KEY IS INVOLVED. This is three SQL reads and a sort, so it
   * answers on a server with no AI configured at all — which is also the only
   * reason it can be exercised end to end here.
   */
  @Get('assignee-suggestion')
  @ApiOperation({ summary: '§V2-S17 — who should take this task, and the numbers behind it' })
  async assigneeSuggestion(@CurrentUser() user: any, @Query('taskId') taskId: string) {
    if (!taskId) {
      throw new HttpException('taskId is required', HttpStatus.BAD_REQUEST)
    }
    const result = await this.ai.suggestAssignee(taskId, user.id)
    /*
     * A REFUSAL IS A 200 WITH A REASON, not a bare 404.
     *
     * "that task does not exist", "you may not assign it" and "there is nobody
     * to choose between" are three different answers, and `taskId` is
     * caller-supplied so a 404 for the first two would also be a membership
     * oracle. The reason code is in the body, where the caller can branch on
     * it; `ai-assign.mjs` asserts on the code, because a status two mechanisms
     * both produce cannot tell them apart.
     */
    return result
  }

  @Post('refs')
  /*
   * 200, NOT NEST'S DEFAULT 201 FOR A POST. This route creates nothing — it is
   * a read whose argument is a list of ids, and a list of ids is a body rather
   * than a query string because an answer can refer to dozens of tasks.
   *
   * Left at 201 it announces "Created" on every chip hydration: wrong for any
   * client that branches on the status, wrong in the access log, and wrong for
   * a check asserting that a read did not write — which is exactly how this was
   * found, by `ai-create-containers.mjs` reporting a resolve as a create.
   */
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve task/list references in an AI answer (live titles and statuses)' })
  async refs(
    @CurrentUser() user: any,
    @Body() body: { workspaceId?: string; taskIds?: string[]; listIds?: string[] },
  ) {
    if (!body?.workspaceId) {
      throw new HttpException('workspaceId is required', HttpStatus.BAD_REQUEST)
    }
    await this.ai.assertWorkspaceMember(body.workspaceId, user.id)
    return this.ai.resolveRefs(body.workspaceId, user.id, {
      taskIds: body.taskIds,
      listIds: body.listIds,
    })
  }

  /**
   * §V2-S16 frame `20:10` — *"13 open tasks total: 11 To Do, 1 In Progress, 1
   * Complete"*, as a number rather than as a sentence.
   *
   * This is the fact a project-status ANSWER is built from: the same method
   * grounds `buildWorkspaceContext`, so the prose and this endpoint cannot
   * disagree about the workspace. Exposed because the frame's own step log
   * claims to be *"Double-checking the live open-task count"* — a claim that is
   * only checkable if the count is reachable.
   *
   * No model, so it answers on an instance with no provider key at all.
   */
  @Get('project-status')
  @ApiOperation({ summary: 'Per-status task breakdown for a workspace (no model; the grounding behind a status answer)' })
  async projectStatus(@CurrentUser() user: any, @Query('workspaceId') workspaceId?: string) {
    if (!workspaceId) {
      throw new HttpException('workspaceId is required', HttpStatus.BAD_REQUEST)
    }
    await this.ai.assertWorkspaceMember(workspaceId, user.id)
    return this.ai.workspaceStatusBreakdown(workspaceId, user.id)
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
      { id: user.id, role: user.role },
    )
  }

  @Post('workload-balance')
  @ApiOperation({ summary: 'Suggest workload redistribution from real per-assignee load (AI, deterministic fallback)' })
  async workloadBalance(@CurrentUser() user: any, @Body() body: { workspaceId?: string }) {
    if (!body?.workspaceId) {
      throw new HttpException('workspaceId is required', HttpStatus.BAD_REQUEST)
    }
    await this.ai.assertWorkspaceMember(body.workspaceId, user.id)
    return this.ai.workloadBalance(body.workspaceId, { userId: user.id, workspaceId: body.workspaceId }, { id: user.id, role: user.role })
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
    await this.ai.assertAvailable('command', { userId: user.id, workspaceId: body.workspaceId })
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
