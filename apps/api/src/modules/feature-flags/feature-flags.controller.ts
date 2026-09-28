import { Controller, Get, Post, Put, Body, Param, ParseUUIDPipe, Query, UseGuards, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { FeatureFlagsService } from './feature-flags.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import type { FlagKey } from '@rundesk/feature-flags'

@ApiTags('feature-flags')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get('resolved')
  async getResolved(@CurrentUser() user: any, @Query('workspaceId') workspaceId?: string) {
    // workspaceId (optional) lets the client resolve flags for the workspace it
    // is viewing; the service verifies the caller can see it before honouring.
    return this.featureFlagsService.resolveForUserRequest(user, workspaceId)
  }

  /*
   * The workspace's raw overrides — who switched which ClickApp, and when —
   * serve the person switching them, so they ask the switch's key,
   * `workspace.clickapps.manage`: an admin's by default, and a custom role
   * grants it. ClickUp ("Intro to ClickApps"): "Only Workspace owners and admins
   * can activate or deactivate ClickApps. Members can view" — which every member
   * does through `resolved`, above. `WorkspaceAdminGuard` admitted managers
   * (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`).
   */
  @Get('workspace/:workspaceId')
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('workspace.clickapps.manage')
  async listWorkspaceOverrides(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.featureFlagsService.listOverrides(workspaceId)
  }

  /**
   * §2.8 gap 11 — ask whoever may switch a feature on to turn it on.
   *
   * Deliberately under no key: the entire point is that the caller does not
   * hold `workspace.clickapps.manage`. The service checks membership, refuses to
   * ask for something already on, and tells the key's holders.
   */
  @Post('request/:flagKey')
  @HttpCode(HttpStatus.OK)
  async requestFlag(
    @Param('flagKey') flagKey: FlagKey,
    @Body() body: { workspaceId?: string },
    @CurrentUser() user: any,
  ) {
    const workspaceId = body?.workspaceId || user?.activeWorkspaceId
    if (!workspaceId) throw new BadRequestException('workspaceId is required')
    return this.featureFlagsService.requestFlag(flagKey, workspaceId, {
      id: user.id,
      name: user.name,
      email: user.email,
    })
  }

  @Put(':flagKey')
  @HttpCode(HttpStatus.OK)
  async setFlag(
    @Param('flagKey') flagKey: FlagKey,
    @Body() body: { enabled: boolean; scope: 'global' | 'workspace' | 'role' | 'user'; scopeId?: string; workspaceId?: string },
    @CurrentUser() user: any,
  ) {
    if (typeof body?.enabled !== 'boolean') {
      throw new BadRequestException('enabled (boolean) is required')
    }
    if (!['global', 'workspace', 'role', 'user'].includes(body?.scope)) {
      throw new BadRequestException('scope must be one of: global, workspace, role, user')
    }
    if ((body.scope === 'workspace' && !body.workspaceId) || (body.scope === 'role' && !body.scopeId) || (body.scope === 'user' && !body.scopeId)) {
      throw new BadRequestException(`scope "${body.scope}" requires the corresponding id`)
    }
    // Authorization is enforced in the service: super_admin for global/role/user
    // scopes, `workspace.clickapps.manage` in the target workspace for workspace scope.
    await this.featureFlagsService.setFlag(
      flagKey,
      body.enabled,
      body.scope,
      body.scopeId ?? null,
      body.workspaceId ?? null,
      { id: user.id, role: user.role },
    )
    return { updated: true }
  }
}
