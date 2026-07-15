import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { SlackService } from './slack.service'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../../auth/guards/workspace-member.guard'
import { WorkspaceAdminGuard } from '../../auth/guards/workspace-admin.guard'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'

@ApiTags('integrations:slack')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/integrations/slack')
export class SlackController {
  constructor(private readonly slack: SlackService) {}

  @Get()
  @ApiOperation({ summary: 'Get current Slack integration status' })
  get(@Param('workspaceId') workspaceId: string) {
    return this.slack.get(workspaceId)
  }

  @Post()
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'Connect or update Slack integration (admin only)' })
  connect(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: { webhookUrl: string; channelName?: string; eventFilters?: string[] },
  ) {
    return this.slack.connect(workspaceId, user.id, body)
  }

  @Patch()
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'Update Slack integration settings (admin only)' })
  update(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { isEnabled?: boolean; channelName?: string; eventFilters?: string[] },
  ) {
    return this.slack.update(workspaceId, body)
  }

  @Delete()
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'Disconnect Slack integration (admin only)' })
  disconnect(@Param('workspaceId') workspaceId: string) {
    return this.slack.disconnect(workspaceId)
  }

  @Post('test')
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'Send a test message to verify Slack works' })
  test(@Param('workspaceId') workspaceId: string) {
    return this.slack.test(workspaceId)
  }

  @Get('rules')
  @ApiOperation({ summary: 'List per-channel Slack routing rules' })
  listRules(@Param('workspaceId') workspaceId: string) {
    return this.slack.listRules(workspaceId)
  }

  @Post('rules')
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'Add a per-channel Slack routing rule (admin only)' })
  addRule(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: { webhookUrl: string; channelName?: string; projectId?: string | null; eventFilters?: string[] },
  ) {
    return this.slack.addRule(workspaceId, user.id, body)
  }

  @Delete('rules/:ruleId')
  @UseGuards(WorkspaceAdminGuard)
  @ApiOperation({ summary: 'Delete a Slack routing rule (admin only)' })
  removeRule(@Param('workspaceId') workspaceId: string, @Param('ruleId') ruleId: string) {
    return this.slack.removeRule(ruleId, workspaceId)
  }
}
