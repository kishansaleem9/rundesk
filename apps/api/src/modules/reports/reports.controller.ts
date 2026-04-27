import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ReportsService } from './reports.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller('workspaces/:workspaceId/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Workspace overview stats' })
  overview(@Param('workspaceId') workspaceId: string) {
    return this.reports.getOverview(workspaceId)
  }

  @Get('productivity')
  @ApiOperation({ summary: 'Per-member productivity report' })
  productivity(
    @Param('workspaceId') workspaceId: string,
    @Query('days') days?: string,
  ) {
    return this.reports.getProductivity(workspaceId, days ? parseInt(days, 10) : 30)
  }

  @Get('completion')
  @ApiOperation({ summary: 'Task completion analytics' })
  completion(
    @Param('workspaceId') workspaceId: string,
    @Query('days') days?: string,
  ) {
    return this.reports.getCompletionAnalytics(workspaceId, days ? parseInt(days, 10) : 30)
  }

  @Get('time')
  @ApiOperation({ summary: 'Time tracking report' })
  time(
    @Param('workspaceId') workspaceId: string,
    @Query('days') days?: string,
  ) {
    return this.reports.getTimeReport(workspaceId, days ? parseInt(days, 10) : 30)
  }

  @Get('sprints')
  @ApiOperation({ summary: 'Sprint velocity report' })
  sprints(@Param('workspaceId') workspaceId: string) {
    return this.reports.getSprintVelocity(workspaceId)
  }

  @Get('goals')
  @ApiOperation({ summary: 'Goals progress report' })
  goals(@Param('workspaceId') workspaceId: string) {
    return this.reports.getGoalsProgress(workspaceId)
  }
}
