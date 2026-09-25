import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request, ParseUUIDPipe } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ResourceMemberGuard } from '../auth/guards/resource-member.guard'
import { WorkspaceAdminGuard } from '../auth/guards/workspace-admin.guard'
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

  // Effective default: the user's own default, else the admin-set workspace default. §5.7
  @Get('workspace/:workspaceId/default')
  @UseGuards(ResourceMemberGuard)
  getDefaultPreset(
    @Request() req: { user: { id: string } },
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string
  ) {
    return this.dashboardsService.getDefaultPreset(req.user.id, workspaceId)
  }

  // Admin-gated: set/clear the workspace-wide default dashboard. §5.7
  @Put('workspace/:workspaceId/preset/:presetId/workspace-default')
  @UseGuards(WorkspaceAdminGuard)
  setWorkspaceDefault(
    @Request() req: { user: { id: string; role?: string } },
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('presetId', new ParseUUIDPipe()) presetId: string
  ) {
    return this.dashboardsService.setWorkspaceDefault(workspaceId, presetId, req.user)
  }

  @Delete('workspace/:workspaceId/workspace-default')
  @UseGuards(WorkspaceAdminGuard)
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
