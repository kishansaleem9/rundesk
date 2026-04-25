import { Controller, Get, Put, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { FeatureFlagsService } from './feature-flags.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import type { FlagKey } from '@rundesk/feature-flags'

@ApiTags('feature-flags')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get('resolved')
  async getResolved(@CurrentUser() user: any) {
    return this.featureFlagsService.resolveForUser({
      userId: user.id,
      workspaceId: user.activeWorkspaceId,
      role: user.role,
    })
  }

  @Put(':flagKey')
  @Roles('super_admin', 'workspace_admin')
  @HttpCode(HttpStatus.OK)
  async setFlag(
    @Param('flagKey') flagKey: FlagKey,
    @Body() body: { enabled: boolean; scope: 'global' | 'workspace' | 'role' | 'user'; scopeId?: string; workspaceId?: string },
    @CurrentUser() user: any,
  ) {
    await this.featureFlagsService.setFlag(
      flagKey,
      body.enabled,
      body.scope,
      body.scopeId ?? null,
      body.workspaceId ?? null,
      user.id,
    )
    return { updated: true }
  }
}
