import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { FeatureFlagsService } from './feature-flags.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
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

  @Get('workspace/:workspaceId')
  @UseGuards(WorkspaceAdminGuard)
  async listWorkspaceOverrides(@Param('workspaceId') workspaceId: string) {
    return this.featureFlagsService.listOverrides(workspaceId)
  }

  /**
   * §2.8 gap 11 — ask the workspace admins to turn a feature on.
   *
   * Deliberately not under WorkspaceAdminGuard: the entire point is that the
   * caller is NOT an admin. The service checks membership and refuses to ask
   * for something already on.
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
    // scopes, workspace_admin of the target workspace for workspace scope.
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
