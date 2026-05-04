import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { DashboardsService } from './dashboards.service'
import { CreateDashboardPresetDto, UpdateDashboardPresetDto } from './dto/dashboard-preset.dto'

@Controller('dashboards')
@UseGuards(JwtAuthGuard)
export class DashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  @Get('workspace/:workspaceId')
  listPresets(@Request() req, @Param('workspaceId') workspaceId: string) {
    return this.dashboardsService.listPresets(req.user.id, workspaceId)
  }

  @Post()
  createPreset(@Request() req, @Body() dto: CreateDashboardPresetDto) {
    return this.dashboardsService.createPreset(req.user.id, dto)
  }

  @Put(':id')
  updatePreset(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateDashboardPresetDto
  ) {
    return this.dashboardsService.updatePreset(req.user.id, id, dto)
  }

  @Delete(':id')
  deletePreset(@Request() req, @Param('id') id: string) {
    return this.dashboardsService.deletePreset(req.user.id, id)
  }

  @Get('dock/:workspaceId')
  getDockConfig(@Request() req, @Param('workspaceId') workspaceId: string) {
    return this.dashboardsService.getDockConfig(req.user.id, workspaceId)
  }

  @Post('dock/:workspaceId')
  updateDockConfig(
    @Request() req,
    @Param('workspaceId') workspaceId: string,
    @Body() patch: { pinnedLinks?: any[], appearance?: any }
  ) {
    return this.dashboardsService.updateDockConfig(req.user.id, workspaceId, patch)
  }
}
