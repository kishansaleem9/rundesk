import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request, ParseUUIDPipe } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { DashboardsService } from './dashboards.service'
import { CreateDashboardPresetDto, UpdateDashboardPresetDto } from './dto/dashboard-preset.dto'

@Controller('dashboards')
@UseGuards(JwtAuthGuard)
export class DashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  @Get('workspace/:workspaceId')
  @UseGuards(ResourceMemberGuard)
  listPresets(@Request() req: { user: { id: string } }, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.dashboardsService.listPresets(req.user.id, workspaceId)
  }

  // Effective default: the user's own default, else the workspace default. §5.7
  // Every member's read: what each widget shows is read as its viewer.
  @Get('workspace/:workspaceId/default')
  @UseGuards(ResourceMemberGuard)
  getDefaultPreset(
    @Request() req: { user: { id: string } },
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string
  ) {
    return this.dashboardsService.getDefaultPreset(req.user.id, workspaceId)
  }

  /*
   * Setting and clearing the workspace-wide default dashboard (§5.7) both ask
   * `dashboard.workspace_default.manage`, an admin's by default and grantable, as
   * ClickUp gives "default views for everyone" to owners and admins. They stood
   * behind `WorkspaceAdminGuard`, which admits managers: setting then asked the
   * admin role in the service and clearing asked nothing more, so a manager
   * cleared what they could not set
   * (`found-25-sep/admin-guard-admits-managers-where-the-web-says-admin`).
   */
  @Put('workspace/:workspaceId/preset/:presetId/workspace-default')
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('dashboard.workspace_default.manage')
  setWorkspaceDefault(
    @Request() req: { user: { id: string; role?: string } },
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('presetId', new ParseUUIDPipe()) presetId: string
  ) {
    return this.dashboardsService.setWorkspaceDefault(workspaceId, presetId, req.user)
  }

  @Delete('workspace/:workspaceId/workspace-default')
  @UseGuards(WorkspaceMemberGuard, PermissionsGuard)
  @RequirePermissions('dashboard.workspace_default.manage')
  clearWorkspaceDefault(@Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.dashboardsService.clearWorkspaceDefault(workspaceId)
  }

  @Post()
  @UseGuards(ResourceMemberGuard)
  createPreset(@Request() req: { user: { id: string } }, @Body() dto: CreateDashboardPresetDto) {
    return this.dashboardsService.createPreset(req.user.id, dto)
  }

  @Put(':id')
  updatePreset(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() dto: UpdateDashboardPresetDto
  ) {
    return this.dashboardsService.updatePreset(req.user.id, id, dto)
  }

  @Delete(':id')
  deletePreset(@Request() req: { user: { id: string } }, @Param('id') id: string) {
    return this.dashboardsService.deletePreset(req.user.id, id)
  }

  @Get('dock/:workspaceId')
  @UseGuards(ResourceMemberGuard)
  getDockConfig(@Request() req: { user: { id: string } }, @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string) {
    return this.dashboardsService.getDockConfig(req.user.id, workspaceId)
  }

  @Post('dock/:workspaceId')
  @UseGuards(ResourceMemberGuard)
  updateDockConfig(
    @Request() req: { user: { id: string } },
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Body() patch: { pinnedLinks?: unknown[] | null; appearance?: any; navFavorites?: unknown; navRecents?: unknown }
  ) {
    return this.dashboardsService.updateDockConfig(req.user.id, workspaceId, patch)
  }
}
