import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ReportsService, type ReportDefinition } from './reports.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard, PermissionsGuard)
@RequirePermissions('report.view.basic')
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

  @Get('workload')
  @ApiOperation({ summary: 'Team workload and capacity heatmap report' })
  workload(
    @Param('workspaceId') workspaceId: string,
    @Query('days') days?: string,
  ) {
    return this.reports.getWorkload(workspaceId, days ? parseInt(days, 10) : 14)
  }

  // ─── Custom report builder ────────────────────────────────────────────────
  @Post('custom/run')
  @ApiOperation({ summary: 'Run an ad-hoc custom report definition' })
  runCustom(
    @Param('workspaceId') workspaceId: string,
    @Body() body: ReportDefinition,
  ) {
    return this.reports.runCustomReport(workspaceId, body ?? {})
  }

  @Post('custom/export')
  @ApiOperation({ summary: 'Run a custom report and return it as CSV' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="rundesk-report.csv"')
  exportCustom(
    @Param('workspaceId') workspaceId: string,
    @Body() body: ReportDefinition,
  ) {
    return this.reports.exportCustomReportCsv(workspaceId, body ?? {})
  }

  @Get('custom')
  @ApiOperation({ summary: 'List saved custom reports' })
  listSaved(@Param('workspaceId') workspaceId: string) {
    return this.reports.listSavedReports(workspaceId)
  }

  @Post('custom')
  @ApiOperation({ summary: 'Save a custom report definition' })
  createSaved(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string },
    @Body() body: { name: string; definition: ReportDefinition },
  ) {
    return this.reports.createSavedReport(workspaceId, user.id, body.name, body.definition ?? {})
  }

  @Patch('custom/:reportId')
  @ApiOperation({ summary: 'Update a saved custom report' })
  updateSaved(
    @Param('workspaceId') workspaceId: string,
    @Param('reportId') reportId: string,
    @Body() body: { name?: string; definition?: ReportDefinition },
  ) {
    return this.reports.updateSavedReport(workspaceId, reportId, body ?? {})
  }

  @Delete('custom/:reportId')
  @ApiOperation({ summary: 'Delete a saved custom report' })
  deleteSaved(
    @Param('workspaceId') workspaceId: string,
    @Param('reportId') reportId: string,
  ) {
    return this.reports.deleteSavedReport(workspaceId, reportId)
  }
}
