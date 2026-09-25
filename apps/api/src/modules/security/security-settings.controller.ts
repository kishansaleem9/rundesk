import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import { WorkspaceSecuritySettingsService } from './workspace-security-settings.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('security')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/security-settings')
export class SecuritySettingsController {
  constructor(private readonly svc: WorkspaceSecuritySettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get workspace security settings + the caller’s current IP' })
  async get(@Param('workspaceId') workspaceId: string, @Req() req: FastifyRequest) {
    const settings = await this.svc.get(workspaceId)
    return { ...settings, currentIp: req.ip }
  }

  @Patch()
  // `security.policy.manage`, as the catalog says; `WorkspaceAdminGuard` admitted
  // managers (`role-editor-offers-unenforced-permissions`).
  @UseGuards(PermissionsGuard)
  @RequirePermissions('security.policy.manage')
  @ApiOperation({ summary: 'Update workspace security settings (admin only)' })
  async update(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string },
    @Req() req: FastifyRequest,
    @Body() body: Record<string, unknown>,
  ) {
    const settings = await this.svc.update(workspaceId, body, user.id, req.ip)
    return { ...settings, currentIp: req.ip }
  }
}
