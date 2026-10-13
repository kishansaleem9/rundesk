import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import type { CurrentUserPayload } from '../tasks/types'
import { AiService } from '../ai/ai.service'
import { AGENT_SKILLS, SuperAgentsService, type AgentInput } from './super-agents.service'
import { SuperAgentsRunner } from './super-agents.runner'

/**
 * A WORKSPACE'S SUPER AGENTS (`commit-log/log-214dac0-1`, `ledger-rows/row-852`):
 * All Agents and My Agents, a new one from scratch or from the builder, and
 * Activity. Who belongs to the workspace is the guard's; that a guest has no
 * agents, and which private ones a reader sees, is the service's.
 */
@ApiTags('super-agents')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/super-agents')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class WorkspaceSuperAgentsController {
  constructor(
    private readonly agents: SuperAgentsService,
    private readonly ai: AiService,
    private readonly runner: SuperAgentsRunner,
  ) {}

  @Get()
  @ApiOperation({ summary: 'The Super Agents this reader may see (All Agents), or only theirs (?mine=true)' })
  list(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload, @Query('mine') mine?: string) {
    return this.agents.list(workspaceId, user, { mine: mine === 'true' })
  }

  @Post()
  @ApiOperation({ summary: 'Make a Super Agent: its own account, a member of this workspace; it then DMs its maker what it can do' })
  async create(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload, @Body() body: AgentInput) {
    const made = await this.agents.create(workspaceId, user, body ?? {})
    // Said after it is made, never in the way of making it.
    void this.runner.introduce(made.id).catch(() => {})
    return made
  }

  @Get('activity')
  @ApiOperation({ summary: 'Every run of the agents this reader may see, newest first, with filters' })
  activity(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('status') status?: string,
    @Query('mine') mine?: string,
    @Query('agentId') agentId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.agents.activity(workspaceId, user, { status, mine: mine === 'true', agentId, from, to })
  }

  @Post('build')
  @HttpCode(200)
  @ApiOperation({ summary: 'The builder: a drafted profile from a description, not saved' })
  async build(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload, @Body() body: { description?: unknown }) {
    await this.agents.assertMayUseAgents(workspaceId, user.id)
    const description = typeof body?.description === 'string' ? body.description.trim() : ''
    if (!description) throw new BadRequestException('Say what the Super Agent should do')
    const draft = await this.ai.draftAgent(description.slice(0, 4000), AGENT_SKILLS, { workspaceId, userId: user.id })
    return this.agents.draftFrom(workspaceId, draft)
  }
}

/** One Super Agent, by id: its profile, sharing, memory, and a test run. Every route asks the service who may. */
@ApiTags('super-agents')
@ApiBearerAuth()
@Controller('super-agents/:id')
@UseGuards(JwtAuthGuard)
export class SuperAgentsController {
  constructor(
    private readonly agents: SuperAgentsService,
    private readonly runner: SuperAgentsRunner,
  ) {}

  @Get()
  get(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.agents.get(id, user)
  }

  @Patch()
  update(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Body() body: AgentInput) {
    return this.agents.update(id, user, body ?? {})
  }

  @Delete()
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.agents.remove(id, user)
  }

  @Post('clone')
  clone(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.agents.clone(id, user)
  }

  @Put('access')
  setAccess(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Body() body: { isPrivate?: unknown; userIds?: unknown }) {
    return this.agents.setAccess(id, user, body ?? {})
  }

  @Post('run')
  @HttpCode(200)
  @ApiOperation({ summary: 'Run agent: a test from its profile, answered on the run' })
  async run(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Body() body: { prompt?: unknown }) {
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 4000) : ''
    return this.runner.runManually(id, user, prompt)
  }

  @Get('memories')
  memories(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.agents.memories(id, user)
  }

  @Post('memories/:memoryId/approve')
  @HttpCode(200)
  approve(@Param('id') id: string, @Param('memoryId') memoryId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.agents.approveMemory(id, memoryId, user)
  }

  @Delete('memories/:memoryId')
  forget(@Param('id') id: string, @Param('memoryId') memoryId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.agents.forgetMemory(id, memoryId, user)
  }
}
