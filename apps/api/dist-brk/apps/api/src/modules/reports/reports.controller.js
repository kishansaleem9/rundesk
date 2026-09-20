"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const reports_service_1 = require("./reports.service");
const scheduled_reports_service_1 = require("./scheduled-reports.service");
const project_health_service_1 = require("./project-health.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const permissions_guard_1 = require("../custom-roles/permissions.guard");
const feature_flag_guard_1 = require("../../common/guards/feature-flag.guard");
const feature_flag_decorator_1 = require("../../common/decorators/feature-flag.decorator");
const feature_flags_1 = require("@rundesk/feature-flags");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
let ReportsController = class ReportsController {
    constructor(reports, scheduledReports, projectHealthSvc) {
        this.reports = reports;
        this.scheduledReports = scheduledReports;
        this.projectHealthSvc = projectHealthSvc;
    }
    overview(workspaceId, user) {
        return this.reports.getOverview(workspaceId, { id: user.id, role: user.role });
    }
    async productivity(workspaceId, user, days, spaceId, projectId) {
        const viewer = await this.reports.getViewerScope(workspaceId, user.id);
        return this.reports.getProductivity(workspaceId, days ? parseInt(days, 10) : 30, viewer, { spaceId, projectId }, { id: user.id, role: user.role });
    }
    productivityTrend(workspaceId, user, days, bucket, spaceId, projectId) {
        return this.reports.getProductivityTrend(workspaceId, days ? parseInt(days, 10) : 90, bucket === 'month' ? 'month' : 'week', { spaceId, projectId }, { id: user.id, role: user.role });
    }
    completion(workspaceId, user, days, spaceId, projectId, memberId) {
        return this.reports.getCompletionAnalytics(workspaceId, days ? parseInt(days, 10) : 30, { spaceId, projectId, memberId }, { id: user.id, role: user.role });
    }
    statusDurations(workspaceId, user, days, spaceId, projectId, memberId) {
        return this.reports.getStatusDurations(workspaceId, days ? parseInt(days, 10) : 90, { spaceId, projectId, memberId }, { id: user.id, role: user.role });
    }
    async time(workspaceId, user, days) {
        const viewer = await this.reports.getViewerScope(workspaceId, user.id);
        return this.reports.getTimeReport(workspaceId, days ? parseInt(days, 10) : 30, viewer, { id: user.id, role: user.role });
    }
    async timeByProject(workspaceId, user, days) {
        const viewer = await this.reports.getViewerScope(workspaceId, user.id);
        return this.reports.getTimeByProject(workspaceId, days ? parseInt(days, 10) : 30, viewer, { id: user.id, role: user.role });
    }
    sprints(workspaceId, user) {
        return this.reports.getSprintVelocity(workspaceId, { id: user.id, role: user.role });
    }
    goals(workspaceId) {
        return this.reports.getGoalsProgress(workspaceId);
    }
    workload(workspaceId, user, days) {
        return this.reports.getWorkload(workspaceId, days ? parseInt(days, 10) : 14, { id: user.id, role: user.role });
    }
    workloadDay(workspaceId, user, userId, date, days) {
        return this.reports.getWorkloadDay(workspaceId, userId, date, days ? parseInt(days, 10) : 14, { id: user.id, role: user.role });
    }
    projectHealth(workspaceId, user) {
        return this.reports.getProjectHealth(workspaceId, { id: user.id, role: user.role });
    }
    projectHealthTrend(workspaceId, projectId, days) {
        return this.projectHealthSvc.getTrend(workspaceId, projectId, days ? parseInt(days, 10) : 30);
    }
    activity(workspaceId, user, limit) {
        return this.reports.getWorkspaceActivity(workspaceId, limit ? parseInt(limit, 10) : 20, { id: user.id, role: user.role });
    }
    // ─── Contribution analytics (§7.14) ────────────────────────────────────────
    parsePeriod(period) {
        return period === 'last-month' || period === 'sprint' ? period : 'this-month';
    }
    async contribution(workspaceId, user, period, sprintId) {
        // Non-privileged viewers are scoped to their own row; managers to their
        // team (containers); admins see everyone (like productivity).
        const viewer = await this.reports.getViewerScope(workspaceId, user.id);
        return this.reports.getContribution(workspaceId, { period: this.parsePeriod(period), sprintId, viewer }, { userId: user.id, role: user.role });
    }
    async contributionPdf(workspaceId, user, body) {
        // Role-gate to managers/admins: getViewerScope returns a 'user' scope only
        // for non-privileged members, which we reject for the team PDF export.
        // Managers get a 'containers' scope so their PDF is scoped to their team.
        const viewer = await this.reports.getViewerScope(workspaceId, user.id);
        if (viewer.kind === 'user')
            throw new common_1.ForbiddenException('Only managers or admins can export the contribution report');
        const buffer = await this.reports.exportContributionPdf(workspaceId, { period: this.parsePeriod(body?.period), sprintId: body?.sprintId, viewer }, { userId: user.id, role: user.role });
        return new common_1.StreamableFile(buffer, {
            type: 'application/pdf',
            disposition: 'attachment; filename="rundesk-contribution.pdf"',
        });
    }
    // ─── Custom report builder ────────────────────────────────────────────────
    runCustom(workspaceId, user, body) {
        return this.reports.runCustomReport(workspaceId, body ?? {}, { id: user.id, role: user.role });
    }
    exportCustom(workspaceId, user, body) {
        return this.reports.exportCustomReportCsv(workspaceId, body ?? {}, { id: user.id, role: user.role });
    }
    async exportCustomPdf(workspaceId, user, body) {
        const buffer = await this.reports.exportCustomReportPdf(workspaceId, body ?? {}, { id: user.id, role: user.role });
        return new common_1.StreamableFile(buffer, {
            type: 'application/pdf',
            disposition: 'attachment; filename="rundesk-report.pdf"',
        });
    }
    listSaved(workspaceId) {
        return this.reports.listSavedReports(workspaceId);
    }
    createSaved(workspaceId, user, body) {
        return this.reports.createSavedReport(workspaceId, user.id, body.name, body.definition ?? {}, body.schedule);
    }
    updateSaved(workspaceId, reportId, body) {
        return this.reports.updateSavedReport(workspaceId, reportId, body ?? {});
    }
    sendNow(workspaceId, reportId) {
        return this.scheduledReports.sendReportNow(workspaceId, reportId);
    }
    deleteSaved(workspaceId, reportId) {
        return this.reports.deleteSavedReport(workspaceId, reportId);
    }
};
exports.ReportsController = ReportsController;
__decorate([
    (0, common_1.Get)('overview'),
    (0, swagger_1.ApiOperation)({ summary: 'Workspace overview stats' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "overview", null);
__decorate([
    (0, common_1.Get)('productivity'),
    (0, swagger_1.ApiOperation)({ summary: 'Per-member productivity report' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('days')),
    __param(3, (0, common_1.Query)('spaceId')),
    __param(4, (0, common_1.Query)('projectId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String, String]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "productivity", null);
__decorate([
    (0, common_1.Get)('productivity-trend'),
    (0, swagger_1.ApiOperation)({ summary: 'Completed-tasks trend by week or month' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('days')),
    __param(3, (0, common_1.Query)('bucket')),
    __param(4, (0, common_1.Query)('spaceId')),
    __param(5, (0, common_1.Query)('projectId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String, String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "productivityTrend", null);
__decorate([
    (0, common_1.Get)('completion'),
    (0, swagger_1.ApiOperation)({ summary: 'Task completion analytics' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('days')),
    __param(3, (0, common_1.Query)('spaceId')),
    __param(4, (0, common_1.Query)('projectId')),
    __param(5, (0, common_1.Query)('memberId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String, String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "completion", null);
__decorate([
    (0, common_1.Get)('status-durations'),
    (0, swagger_1.ApiOperation)({ summary: 'Average time tasks spend in each status (bottlenecks)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('days')),
    __param(3, (0, common_1.Query)('spaceId')),
    __param(4, (0, common_1.Query)('projectId')),
    __param(5, (0, common_1.Query)('memberId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String, String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "statusDurations", null);
__decorate([
    (0, common_1.Get)('time'),
    (0, swagger_1.ApiOperation)({ summary: 'Time tracking report' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "time", null);
__decorate([
    (0, common_1.Get)('time-by-project'),
    (0, swagger_1.ApiOperation)({ summary: 'Billable hours by project + client' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "timeByProject", null);
__decorate([
    (0, common_1.Get)('sprints'),
    (0, swagger_1.ApiOperation)({ summary: 'Sprint velocity report' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "sprints", null);
__decorate([
    (0, common_1.Get)('goals'),
    (0, swagger_1.ApiOperation)({ summary: 'Goals progress report' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "goals", null);
__decorate([
    (0, common_1.Get)('workload'),
    (0, swagger_1.ApiOperation)({ summary: 'Team workload and capacity heatmap report' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "workload", null);
__decorate([
    (0, common_1.Get)('workload/day'),
    (0, swagger_1.ApiOperation)({ summary: "Tasks composing one workload heat-map cell (user × day)" }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('userId')),
    __param(3, (0, common_1.Query)('date')),
    __param(4, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "workloadDay", null);
__decorate([
    (0, common_1.Get)('project-health'),
    (0, swagger_1.ApiOperation)({ summary: 'Deterministic per-project health scores (0–100)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "projectHealth", null);
__decorate([
    (0, common_1.Get)('project-health/trend'),
    (0, swagger_1.ApiOperation)({ summary: 'Persisted daily project-health trend (§7.13)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Query)('projectId')),
    __param(2, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "projectHealthTrend", null);
__decorate([
    (0, common_1.Get)('activity'),
    (0, swagger_1.ApiOperation)({ summary: 'Workspace-wide recent task activity feed' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "activity", null);
__decorate([
    (0, common_1.Get)('contribution'),
    (0, swagger_1.ApiOperation)({ summary: 'Per-member contribution factors + AI narrative for a period (§7.14)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('period')),
    __param(3, (0, common_1.Query)('sprintId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "contribution", null);
__decorate([
    (0, common_1.Post)('contribution.pdf'),
    (0, swagger_1.ApiOperation)({ summary: 'Contribution report as a server-rendered PDF (managers/admins only, §7.14)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "contributionPdf", null);
__decorate([
    (0, common_1.Post)('custom/run'),
    (0, swagger_1.ApiOperation)({ summary: 'Run an ad-hoc custom report definition' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "runCustom", null);
__decorate([
    (0, common_1.Post)('custom/export'),
    (0, swagger_1.ApiOperation)({ summary: 'Run a custom report and return it as CSV' }),
    (0, common_1.Header)('Content-Type', 'text/csv; charset=utf-8'),
    (0, common_1.Header)('Content-Disposition', 'attachment; filename="rundesk-report.csv"'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "exportCustom", null);
__decorate([
    (0, common_1.Post)('custom/export.pdf'),
    (0, swagger_1.ApiOperation)({ summary: 'Run a custom report and return it as a server-rendered PDF' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "exportCustomPdf", null);
__decorate([
    (0, common_1.Get)('custom'),
    (0, swagger_1.ApiOperation)({ summary: 'List saved custom reports' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "listSaved", null);
__decorate([
    (0, common_1.Post)('custom'),
    (0, swagger_1.ApiOperation)({ summary: 'Save a custom report definition' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "createSaved", null);
__decorate([
    (0, common_1.Patch)('custom/:reportId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a saved custom report' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('reportId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "updateSaved", null);
__decorate([
    (0, common_1.Post)('custom/:reportId/send-now'),
    (0, swagger_1.ApiOperation)({ summary: 'Send a saved custom report immediately to its recipients (§9.5)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('reportId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "sendNow", null);
__decorate([
    (0, common_1.Delete)('custom/:reportId'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a saved custom report' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('reportId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ReportsController.prototype, "deleteSaved", null);
exports.ReportsController = ReportsController = __decorate([
    (0, swagger_1.ApiTags)('reports'),
    (0, swagger_1.ApiBearerAuth)()
    // REPORTING is default-enabled; FeatureFlagGuard (after JwtAuthGuard) 404s the
    // reports API only where a workspace has explicitly disabled the flag.
    ,
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard, permissions_guard_1.PermissionsGuard, feature_flag_guard_1.FeatureFlagGuard),
    (0, permissions_guard_1.RequirePermissions)('report.view.basic'),
    (0, feature_flag_decorator_1.FeatureFlag)(feature_flags_1.FLAGS.REPORTING),
    (0, common_1.Controller)('workspaces/:workspaceId/reports'),
    __metadata("design:paramtypes", [reports_service_1.ReportsService,
        scheduled_reports_service_1.ScheduledReportsService,
        project_health_service_1.ProjectHealthService])
], ReportsController);
//# sourceMappingURL=reports.controller.js.map