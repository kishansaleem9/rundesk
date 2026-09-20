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
exports.ExportController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const export_service_1 = require("./export.service");
const workspaces_service_1 = require("../workspaces/workspaces.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
let ExportController = class ExportController {
    constructor(svc, workspaces) {
        this.svc = svc;
        this.workspaces = workspaces;
    }
    async exportJson(workspaceId, user, ip, res) {
        const data = await this.svc.exportWorkspace(workspaceId, { id: user.id, role: user.role });
        const json = JSON.stringify(data, null, 2);
        res.header('Content-Type', 'application/json');
        res.header('Content-Disposition', `attachment; filename="rundesk-export-${workspaceId}.json"`);
        await this.svc.logExport(workspaceId, user.id, 'json', 'full', {
            tasks: data.tasks.length,
            spaces: data.spaces.length,
            projects: data.projects.length,
            lists: data.lists.length,
            members: data.members.length,
        }, ip);
        res.send(json);
    }
    async exportTasksCsv(workspaceId, user, ip, res) {
        const data = await this.svc.exportWorkspace(workspaceId, { id: user.id, role: user.role });
        const csv = this.svc.exportToCsv(data.tasks);
        res.header('Content-Type', 'text/csv');
        res.header('Content-Disposition', `attachment; filename="rundesk-tasks-${workspaceId}.csv"`);
        await this.svc.logExport(workspaceId, user.id, 'csv', 'tasks', {
            tasks: data.tasks.length,
        }, ip);
        res.send(csv);
    }
    async exportMembersCsv(workspaceId, user, ip, res) {
        const members = await this.workspaces.listMembers(workspaceId);
        const csv = this.svc.membersToCsv(members);
        res.header('Content-Type', 'text/csv');
        res.header('Content-Disposition', `attachment; filename="rundesk-members-${workspaceId}.csv"`);
        await this.svc.logExport(workspaceId, user.id, 'csv', 'members', { members: members.length }, ip);
        res.send(csv);
    }
};
exports.ExportController = ExportController;
__decorate([
    (0, common_1.Get)('json'),
    (0, swagger_1.ApiOperation)({ summary: 'Export all workspace data as JSON' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Ip)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, Object]),
    __metadata("design:returntype", Promise)
], ExportController.prototype, "exportJson", null);
__decorate([
    (0, common_1.Get)('csv/tasks'),
    (0, swagger_1.ApiOperation)({ summary: 'Export tasks as CSV' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Ip)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, Object]),
    __metadata("design:returntype", Promise)
], ExportController.prototype, "exportTasksCsv", null);
__decorate([
    (0, common_1.Get)('csv/members'),
    (0, swagger_1.ApiOperation)({ summary: 'Export the People roster as CSV (§A4.1)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Ip)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, Object]),
    __metadata("design:returntype", Promise)
], ExportController.prototype, "exportMembersCsv", null);
exports.ExportController = ExportController = __decorate([
    (0, swagger_1.ApiTags)('export'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, common_1.Controller)('workspaces/:workspaceId/export'),
    __metadata("design:paramtypes", [export_service_1.ExportService,
        workspaces_service_1.WorkspacesService])
], ExportController);
//# sourceMappingURL=export.controller.js.map