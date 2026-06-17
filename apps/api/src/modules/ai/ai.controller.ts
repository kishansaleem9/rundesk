import { Body, Controller, Get, Post, Res, UseGuards, HttpException, HttpStatus } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AiService } from './ai.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('status')
  @ApiOperation({ summary: 'Check if AI features are available' })
  status() {
    return { available: this.ai.isAvailable() }
  }

  @Post('task/generate')
  @ApiOperation({ summary: 'Generate a task from a natural language prompt' })
  async generateTask(@Body() body: { prompt: string; context?: string }) {
    if (!this.ai.isAvailable()) {
      throw new HttpException('AI features are not configured', HttpStatus.SERVICE_UNAVAILABLE)
    }
    return this.ai.generateTask(body.prompt, body.context)
  }

  @Post('task/priority')
  @ApiOperation({ summary: 'Suggest priority for a task' })
  async suggestPriority(@Body() body: { title: string; description?: string }) {
    if (!this.ai.isAvailable()) {
      throw new HttpException('AI features are not configured', HttpStatus.SERVICE_UNAVAILABLE)
    }
    return this.ai.suggestPriority(body.title, body.description)
  }

  @Post('task/deadline')
  @ApiOperation({ summary: 'Suggest a deadline for a task' })
  async suggestDeadline(@Body() body: { title: string; description?: string; teamWorkload?: string }) {
    if (!this.ai.isAvailable()) {
      throw new HttpException('AI features are not configured', HttpStatus.SERVICE_UNAVAILABLE)
    }
    return this.ai.suggestDeadline(body.title, body.description, body.teamWorkload)
  }

  @Post('summarize')
  @ApiOperation({ summary: 'Summarize a task or project' })
  async summarize(@Body() body: { content: string; type?: 'task' | 'project' }) {
    if (!this.ai.isAvailable()) {
      throw new HttpException('AI features are not configured', HttpStatus.SERVICE_UNAVAILABLE)
    }
    const summary = await this.ai.summarize(body.content, body.type ?? 'task')
    return { summary }
  }

  @Post('writing/improve')
  @ApiOperation({ summary: 'Improve writing with AI' })
  async improveWriting(
    @Body() body: { text: string; mode?: 'improve' | 'shorten' | 'expand' | 'format' },
  ) {
    if (!this.ai.isAvailable()) {
      throw new HttpException('AI features are not configured', HttpStatus.SERVICE_UNAVAILABLE)
    }
    const improved = await this.ai.improveWriting(body.text, body.mode ?? 'improve')
    return { improved }
  }

  @Post('meeting-notes')
  @ApiOperation({ summary: 'Extract action items from meeting notes' })
  async extractFromNotes(@Body() body: { notes: string }) {
    if (!this.ai.isAvailable()) {
      throw new HttpException('AI features are not configured', HttpStatus.SERVICE_UNAVAILABLE)
    }
    return this.ai.extractTasksFromNotes(body.notes)
  }

  @Post('insights')
  @ApiOperation({ summary: 'Generate AI insights from real workspace metrics' })
  async insights(@Body() body: { context: string }) {
    if (!this.ai.isAvailable()) {
      throw new HttpException('AI features are not configured', HttpStatus.SERVICE_UNAVAILABLE)
    }
    return this.ai.generateInsights(body.context ?? '')
  }

  @Post('dashboard/suggest-layout')
  @ApiOperation({ summary: 'Suggest a dashboard widget layout with AI' })
  async suggestLayout(
    @Body() body: { availableWidgets: Array<{ type: string; label: string }>; context?: string },
  ) {
    if (!this.ai.isAvailable()) {
      throw new HttpException('AI features are not configured', HttpStatus.SERVICE_UNAVAILABLE)
    }
    return this.ai.suggestDashboardLayout(body.availableWidgets ?? [], body.context ?? '')
  }

  @Post('chat')
  @ApiOperation({ summary: 'Chat with AI assistant (streaming SSE)' })
  async chat(
    @Body()
    body: {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      workspaceContext?: string
    },
    @Res() res: any,
  ) {
    if (!this.ai.isAvailable()) {
      res.status(503).send({ error: 'AI features are not configured' })
      return
    }
    await this.ai.chatStream(body.messages, body.workspaceContext ?? '', res as any)
  }
}
