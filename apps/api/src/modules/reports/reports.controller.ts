import { Body, Controller, Delete, ForbiddenException, Get, Header, Param, Patch, Post, Query, StreamableFile, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ReportsService, type ContributionPeriodType, type ReportDefinition, type ReportScheduleInput } from './reports.service'
import { ScheduledReportsService } from './scheduled-reports.service'
import { ProjectHealthService } from './project-health.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { WorkspaceMemberGuard } from '../auth/guards/workspace-member.guard'
import { PermissionsGuard, RequirePermissions } from '../custom-roles/permissions.guard'
import { FeatureFlagGuard } from '../../common/guards/feature-flag.guard'
import { FeatureFlag } from '../../common/decorators/feature-flag.decorator'
import { FLAGS } from '@rundesk/feature-flags'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('reports')
@ApiBearerAuth()
// REPORTING is default-enabled; FeatureFlagGuard (after JwtAuthGuard) 404s the
// reports API only where a workspace has explicitly disabled the flag.
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard, PermissionsGuard, FeatureFlagGuard)
@RequirePermissions('report.view.basic')
@FeatureFlag(FLAGS.REPORTING)
@Controller('workspaces/:workspaceId/reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly scheduledReports: ScheduledReportsService,
    private readonly projectHealthSvc: ProjectHealthService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Workspace overview stats' })
  overview(@Param('workspaceId') workspaceId: string) {
    return this.reports.getOverview(workspaceId)
  }

  @Get('productivity')
  @ApiOperation({ summary: 'Per-member productivity report' })
  async productivity(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string },
    @Query('days') days?: string,
    @Query('spaceId') spaceId?: string,
    @Query('projectId') projectId?: string,
  ) {
    const viewer = await this.reports.getViewerScope(workspaceId, user.id)
    return this.reports.getProductivity(workspaceId, days ? parseInt(days, 10) : 30, viewer, { spaceId, projectId })
  }

  @Get('productivity-trend')
  @ApiOperation({ summary: 'Completed-tasks trend by week or month' })
  productivityTrend(
    @Param('workspaceId') workspaceId: string,
    @Query('days') days?: string,
    @Query('bucket') bucket?: string,
    @Query('spaceId') spaceId?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.reports.getProductivityTrend(
      workspaceId,
      days ? parseInt(days, 10) : 90,
      bucket === 'month' ? 'month' : 'week',
      { spaceId, projectId },
    )
  }

  @Get('completion')
  @ApiOperation({ summary: 'Task completion analytics' })
  completion(
    @Param('workspaceId') workspaceId: string,
    @Query('days') days?: string,
    @Query('spaceId') spaceId?: string,
    @Query('projectId') projectId?: string,
    @Query('memberId') memberId?: string,
  ) {
    return this.reports.getCompletionAnalytics(workspaceId, days ? parseInt(days, 10) : 30, {
      spaceId,
      projectId,
      memberId,
    })
  }

  @Get('status-durations')
  @ApiOperation({ summary: 'Average time tasks spend in each status (bottlenecks)' })
  statusDurations(
    @Param('workspaceId') workspaceId: string,
    @Query('days') days?: string,
    @Query('spaceId') spaceId?: string,
    @Query('projectId') projectId?: string,
    @Query('memberId') memberId?: string,
  ) {
    return this.reports.getStatusDurations(workspaceId, days ? parseInt(days, 10) : 90, {
      spaceId,
      projectId,
      memberId,
    })
  }

  @Get('time')
  @ApiOperation({ summary: 'Time tracking report' })
  async time(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string },
    @Query('days') days?: string,
  ) {
    const viewer = await this.reports.getViewerScope(workspaceId, user.id)
    return this.reports.getTimeReport(workspaceId, days ? parseInt(days, 10) : 30, viewer)
  }

  @Get('time-by-project')
  @ApiOperation({ summary: 'Billable hours by project + client' })
  async timeByProject(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string },
    @Query('days') days?: string,
  ) {
    const viewer = await this.reports.getViewerScope(workspaceId, user.id)
    return this.reports.getTimeByProject(workspaceId, days ? parseInt(days, 10) : 30, viewer)
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

  @Get('workload/day')
  @ApiOperation({ summary: "Tasks composing one workload heat-map cell (user × day)" })
  workloadDay(
    @Param('workspaceId') workspaceId: string,
    @Query('userId') userId: string,
    @Query('date') date: string,
    @Query('days') days?: string,
  ) {
    return this.reports.getWorkloadDay(workspaceId, userId, date, days ? parseInt(days, 10) : 14)
  }

  @Get('project-health')
  @ApiOperation({ summary: 'Deterministic per-project health scores (0–100)' })
  projectHealth(@Param('workspaceId') workspaceId: string) {
    return this.reports.getProjectHealth(workspaceId)
  }

  @Get('project-health/trend')
  @ApiOperation({ summary: 'Persisted daily project-health trend (§7.13)' })
  projectHealthTrend(
    @Param('workspaceId') workspaceId: string,
    @Query('projectId') projectId: string,
    @Query('days') days?: string,
  ) {
    return this.projectHealthSvc.getTrend(workspaceId, projectId, days ? parseInt(days, 10) : 30)
  }

  @Get('activity')
  @ApiOperation({ summary: 'Workspace-wide recent task activity feed' })
  activity(
    @Param('workspaceId') workspaceId: string,
    @Query('limit') limit?: string,
  ) {
    return this.reports.getWorkspaceActivity(workspaceId, limit ? parseInt(limit, 10) : 20)
  }

  // ─── Contribution analytics (§7.14) ────────────────────────────────────────
  private parsePeriod(period?: string): ContributionPeriodType {
    return period === 'last-month' || period === 'sprint' ? period : 'this-month'
  }

  @Get('contribution')
  @ApiOperation({ summary: 'Per-member contribution factors + AI narrative for a period (§7.14)' })
  async contribution(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string },
    @Query('period') period?: string,
    @Query('sprintId') sprintId?: string,
  ) {
    // Non-privileged viewers are scoped to their own row; managers to their
    // team (containers); admins see everyone (like productivity).
    const viewer = await this.reports.getViewerScope(workspaceId, user.id)
    return this.reports.getContribution(
      workspaceId,
      { period: this.parsePeriod(period), sprintId, viewer },
      { userId: user.id },
    )
  }

  @Post('contribution.pdf')
  @ApiOperation({ summary: 'Contribution report as a server-rendered PDF (managers/admins only, §7.14)' })
  async contributionPdf(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: { id: string },
    @Body() body: { period?: string; sprintId?: string },
  ): Promise<StreamableFile> {
    // Role-gate to managers/admins: getViewerScope returns a 'user' scope only
    // for non-privileged members, which we reject for the team PDF export.
    // Managers get a 'containers' scope so their PDF is scoped to their team.
    const viewer = await this.reports.getViewerScope(workspaceId, user.id)
    if (viewer.kind === 'user') throw new ForbiddenException('Only managers or admins can export the contribution report')
    const buffer = await this.reports.exportContributionPdf(
      workspaceId,
      { period: this.parsePeriod(body?.period), sprintId: body?.sprintId, viewer },
      { userId: user.id },
    )
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: 'attachment; filename="rundesk-contribution.pdf"',
    })
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

  @Post('custom/export.pdf')
  @ApiOperation({ summary: 'Run a custom report and return it as a server-rendered PDF' })
  async exportCustomPdf(
    @Param('workspaceId') workspaceId: string,
    @Body() body: ReportDefinition,
  ): Promise<StreamableFile> {
    const buffer = await this.reports.exportCustomReportPdf(workspaceId, body ?? {})
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: 'attachment; filename="rundesk-report.pdf"',
    })
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
    @Body() body: { name: string; definition: ReportDefinition; schedule?: ReportScheduleInput },
  ) {
    return this.reports.createSavedReport(workspaceId, user.id, body.name, body.definition ?? {}, body.schedule)
  }

  @Patch('custom/:reportId')
  @ApiOperation({ summary: 'Update a saved custom report' })
  updateSaved(
    @Param('workspaceId') workspaceId: string,
    @Param('reportId') reportId: string,
    @Body() body: { name?: string; definition?: ReportDefinition; schedule?: ReportScheduleInput },
  ) {
    return this.reports.updateSavedReport(workspaceId, reportId, body ?? {})
  }

  @Post('custom/:reportId/send-now')
  @ApiOperation({ summary: 'Send a saved custom report immediately to its recipients (§9.5)' })
  sendNow(
    @Param('workspaceId') workspaceId: string,
    @Param('reportId') reportId: string,
  ) {
    return this.scheduledReports.sendReportNow(workspaceId, reportId)
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
