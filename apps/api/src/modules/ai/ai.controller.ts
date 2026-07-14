import { Body, Controller, Get, Post, Query, Res, UseGuards, HttpException, HttpStatus } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AiService } from './ai.service'
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
    @Body() body: { prompt: string; context?: string; workspaceId?: string },
  ) {
    if (!this.ai.isAvailable()) {
      throw new HttpException('AI features are not configured', HttpStatus.SERVICE_UNAVAILABLE)
    }
    return this.ai.generateTask(body.prompt, body.context, { userId: user.id, workspaceId: body.workspaceId })
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
  @ApiOperation({ summary: 'Suggest a deadline for a task' })
  async suggestDeadline(
    @CurrentUser() user: any,
    @Body() body: { title: string; description?: string; teamWorkload?: string; workspaceId?: string },
  ) {
    if (!this.ai.isAvailable()) {
      throw new HttpException('AI features are not configured', HttpStatus.SERVICE_UNAVAILABLE)
    }
    return this.ai.suggestDeadline(body.title, body.description, body.teamWorkload, {
      userId: user.id,
      workspaceId: body.workspaceId,
    })
  }

  @Post('summarize')
  @ApiOperation({ summary: 'Summarize a task or project' })
  async summarize(
    @CurrentUser() user: any,
    @Body() body: { content: string; type?: 'task' | 'project'; workspaceId?: string },
  ) {
    if (!this.ai.isAvailable()) {
      throw new HttpException('AI features are not configured', HttpStatus.SERVICE_UNAVAILABLE)
    }
    const summary = await this.ai.summarize(body.content, body.type ?? 'task', {
      userId: user.id,
      workspaceId: body.workspaceId,
    })
    return { summary }
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
    },
    @Res() res: any,
  ) {
    if (!this.ai.isAvailable()) {
      res.status(503).send({ error: 'AI features are not configured' })
      return
    }
    // Real context injection (§7.6): build a grounded workspace summary
    // server-side when a workspaceId is provided.
    const context = body.workspaceId
      ? await this.ai.buildWorkspaceContext(body.workspaceId, user.id)
      : body.workspaceContext ?? ''
    await this.ai.chatStream(body.messages, context, res as any, {
      userId: user.id,
      workspaceId: body.workspaceId,
    })
  }
}
