import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AutomationsService } from './automations.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard'
import { FeatureFlag } from '../../common/decorators/feature-flag.decorator'
import { FLAGS } from '@rundesk/feature-flags'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

// FeatureFlagGuard enforces the Automations ClickApp — a workspace that turns
// Automations off gets 404s here. AI_AUTOMATIONS is default-enabled.
@ApiTags('automations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard, FeatureFlagGuard)
@FeatureFlag(FLAGS.AI_AUTOMATIONS)
@Controller('workspaces/:workspaceId/automations')
export class AutomationsController {
  constructor(private readonly svc: AutomationsService) {}

  @Get()
  @ApiOperation({ summary: 'List all automations in a workspace' })
  list(@Param('workspaceId') workspaceId: string) {
    return this.svc.list(workspaceId)
  }

  @Post()
  // `automation.manage` (`role-editor-offers-unenforced-permissions`).
  @UseGuards(PermissionsGuard)
  @RequirePermissions('automation.manage')
  @ApiOperation({ summary: 'Create an automation rule (admin only)' })
  create(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body()
    body: {
      name: string
      trigger: { type: string; filters?: Record<string, string | string[] | undefined> }
      actions: Array<{ type: string; params: Record<string, string | string[] | undefined> }>
    },
  ) {
    return this.svc.create(workspaceId, user.id, body)
  }

  @Get(':automationId')
  getOne(
    @Param('workspaceId') workspaceId: string,
    @Param('automationId') automationId: string,
  ) {
    return this.svc.getOne(workspaceId, automationId)
  }

  @Patch(':automationId')
  // `automation.manage` (`role-editor-offers-unenforced-permissions`).
  @UseGuards(PermissionsGuard)
  @RequirePermissions('automation.manage')
  update(
    @Param('workspaceId') workspaceId: string,
    @Param('automationId') automationId: string,
    @Body() body: any,
  ) {
    return this.svc.update(workspaceId, automationId, body)
  }

  @Delete(':automationId')
  // `automation.manage` (`role-editor-offers-unenforced-permissions`).
  @UseGuards(PermissionsGuard)
  @RequirePermissions('automation.manage')
  remove(
    @Param('workspaceId') workspaceId: string,
    @Param('automationId') automationId: string,
  ) {
    return this.svc.remove(workspaceId, automationId)
  }

  @Get(':automationId/runs')
  listRuns(
    @Param('workspaceId') workspaceId: string,
    @Param('automationId') automationId: string,
  ) {
    return this.svc.listRuns(workspaceId, automationId)
  }

  /*
   * ClickUp's test of an automation (`found-14-oct/automation-conditions-and-actions-unbuilt`): what the
   * rule would do to a task — each condition's verdict and the actions it would take — with nothing done.
   */
  @Post(':automationId/test')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('automation.manage')
  @ApiOperation({ summary: 'What an automation would do to a task, done to nothing' })
  test(
    @Param('workspaceId') workspaceId: string,
    @Param('automationId') automationId: string,
    @Body() body: { taskId?: string },
    @CurrentUser() user: { id: string },
  ) {
    return this.svc.test(workspaceId, automationId, body?.taskId, { id: user.id })
  }
}
