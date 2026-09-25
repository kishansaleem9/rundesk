import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { SlackService } from './slack.service'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../../auth/guards/workspace-member.guard'
import { PermissionsGuard, RequirePermissions } from '../../custom-roles/permissions.guard'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'

@ApiTags('integrations:slack')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/integrations/slack')
/*
 * Changing Slack is `integrations.manage`'s, the key the permission catalog
 * files it under ("Connect / disconnect Slack, GitHub, Google, etc."). These
 * routes asked for a workspace admin instead, so a custom role granting the
 * key to anybody else was saved and never usable here — the App Center and
 * Settings now offer Slack to its holder, and this is the route they reach
 * (`product-siblings/custom-role-permissions-unread-by-web`). An admin holds
 * the key through their role, as before.
 */
export class SlackController {
  constructor(private readonly slack: SlackService) {}

  @Get()
  @ApiOperation({ summary: 'Get current Slack integration status' })
  get(@Param('workspaceId') workspaceId: string) {
    return this.slack.get(workspaceId)
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('integrations.manage')
  @ApiOperation({ summary: 'Connect or update Slack integration (needs integrations.manage)' })
  connect(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: { webhookUrl: string; channelName?: string; eventFilters?: string[] },
  ) {
    return this.slack.connect(workspaceId, user.id, body)
  }

  @Patch()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('integrations.manage')
  @ApiOperation({ summary: 'Update Slack integration settings (needs integrations.manage)' })
  update(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { isEnabled?: boolean; channelName?: string; eventFilters?: string[] },
  ) {
    return this.slack.update(workspaceId, body)
  }

  @Delete()
  @UseGuards(PermissionsGuard)
  @RequirePermissions('integrations.manage')
  @ApiOperation({ summary: 'Disconnect Slack integration (needs integrations.manage)' })
  disconnect(@Param('workspaceId') workspaceId: string) {
    return this.slack.disconnect(workspaceId)
  }

  @Post('test')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('integrations.manage')
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
  @UseGuards(PermissionsGuard)
  @RequirePermissions('integrations.manage')
  @ApiOperation({ summary: 'Add a per-channel Slack routing rule (needs integrations.manage)' })
  addRule(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: { webhookUrl: string; channelName?: string; projectId?: string | null; eventFilters?: string[] },
  ) {
    return this.slack.addRule(workspaceId, user.id, body)
  }

  @Delete('rules/:ruleId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('integrations.manage')
  @ApiOperation({ summary: 'Delete a Slack routing rule (needs integrations.manage)' })
  removeRule(@Param('workspaceId') workspaceId: string, @Param('ruleId') ruleId: string) {
    return this.slack.removeRule(ruleId, workspaceId)
  }
}
