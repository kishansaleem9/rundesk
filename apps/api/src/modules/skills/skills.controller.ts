import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { SkillsService } from './skills.service'
import type { SkillTab } from './skill-visibility'
import {
  AddSkillConnectionDto,
  AddSkillMemoryDto,
  ApproveSkillProposalDto,
  CreateSkillDto,
  UpdateSkillDto,
} from './dto/skill.dto'
import type { CurrentUserPayload } from '../tasks/types'

/**
 * §15 Skills.
 *
 * Every route carries `:workspaceId` and `WorkspaceMemberGuard`, including the
 * ones addressing a single skill by id. Hanging the detail routes off a bare
 * `/skills/:id` would have been shorter and would have skipped the membership
 * check entirely — the service's own visibility filter would then be the only
 * thing standing between a stranger and a workspace's skills, which is one
 * mistake away from nothing at all.
 */
@ApiTags('skills')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/skills')
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
export class SkillsController {
  constructor(private svc: SkillsService) {}

  @Get('templates')
  @ApiOperation({ summary: 'Starter skill templates for the hub carousel' })
  templates() {
    return this.svc.templates()
  }

  @Get()
  @ApiOperation({ summary: 'List skills visible to the caller (tab: all | enabled | mine)' })
  list(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Query('tab') tab?: string,
  ) {
    const requested: SkillTab =
      tab === 'enabled' || tab === 'mine' ? tab : 'all'
    return this.svc.list(workspaceId, user.id, requested)
  }

  @Get('counts')
  @ApiOperation({ summary: 'Skill counts per library tab' })
  counts(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.counts(workspaceId, user.id)
  }

  @Post()
  @ApiOperation({ summary: 'Create a skill, optionally seeded from a template' })
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateSkillDto,
  ) {
    return this.svc.create(workspaceId, user.id, body)
  }

  @Post('from-proposal')
  @ApiOperation({ summary: "§15 — approve a drafted skill: \"Approve this approach and I'll create it\"" })
  createFromProposal(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: ApproveSkillProposalDto,
  ) {
    return this.svc.createFromProposal(workspaceId, user.id, body)
  }

  @Get('installed')
  @ApiOperation({ summary: '§15 — ids of the skills the caller has installed' })
  installed(@Param('workspaceId') workspaceId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.svc.installedIds(workspaceId, user.id)
  }

  @Post(':id/install')
  @ApiOperation({ summary: "§15 — the hub's install: needs only the right to see it" })
  install(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.svc.install(workspaceId, user.id, id)
  }

  @Delete(':id/install')
  uninstall(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.svc.uninstall(workspaceId, user.id, id)
  }

  @Get(':id')
  get(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.svc.get(workspaceId, user.id, id)
  }

  @Patch(':id')
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: UpdateSkillDto,
  ) {
    return this.svc.update(workspaceId, user.id, id, body)
  }

  @Delete(':id')
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.svc.remove(workspaceId, user.id, id)
  }

  // ─── Memory ───────────────────────────────────────────────────────────────

  @Get(':id/memories')
  @ApiOperation({ summary: "What the skill has been told — [18:42] 'yeh MEMORY hai'" })
  listMemories(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.svc.listMemories(workspaceId, user.id, id)
  }

  @Post(':id/memories')
  addMemory(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: AddSkillMemoryDto,
  ) {
    return this.svc.addMemory(workspaceId, user.id, id, body)
  }

  @Delete(':id/memories/:memoryId')
  removeMemory(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Param('memoryId') memoryId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.svc.removeMemory(workspaceId, user.id, id, memoryId)
  }

  // ─── Connections ──────────────────────────────────────────────────────────

  @Get(':id/connections')
  @ApiOperation({ summary: 'Systems this skill may draw on — [18:58]' })
  listConnections(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.svc.listConnections(workspaceId, user.id, id)
  }

  @Post(':id/connections')
  addConnection(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: AddSkillConnectionDto,
  ) {
    return this.svc.addConnection(workspaceId, user.id, id, body)
  }

  @Delete(':id/connections/:connectionRowId')
  removeConnection(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Param('connectionRowId') connectionRowId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.svc.removeConnection(workspaceId, user.id, id, connectionRowId)
  }
}
