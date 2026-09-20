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
exports.DashboardsController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
const dashboards_service_1 = require("./dashboards.service");
const dashboard_preset_dto_1 = require("./dto/dashboard-preset.dto");
let DashboardsController = class DashboardsController {
    constructor(dashboardsService) {
        this.dashboardsService = dashboardsService;
    }
    listPresets(req, workspaceId) {
        return this.dashboardsService.listPresets(req.user.id, workspaceId);
    }
    // Effective default: the user's own default, else the admin-set workspace default. §5.7
    getDefaultPreset(req, workspaceId) {
        return this.dashboardsService.getDefaultPreset(req.user.id, workspaceId);
    }
    // Admin-gated: set/clear the workspace-wide default dashboard. §5.7
    setWorkspaceDefault(req, workspaceId, presetId) {
        return this.dashboardsService.setWorkspaceDefault(workspaceId, presetId, req.user);
    }
    clearWorkspaceDefault(workspaceId) {
        return this.dashboardsService.clearWorkspaceDefault(workspaceId);
    }
    createPreset(req, dto) {
        return this.dashboardsService.createPreset(req.user.id, dto);
    }
    updatePreset(req, id, dto) {
        return this.dashboardsService.updatePreset(req.user.id, id, dto);
    }
    deletePreset(req, id) {
        return this.dashboardsService.deletePreset(req.user.id, id);
    }
    getDockConfig(req, workspaceId) {
        return this.dashboardsService.getDockConfig(req.user.id, workspaceId);
    }
    updateDockConfig(req, workspaceId, patch) {
        return this.dashboardsService.updateDockConfig(req.user.id, workspaceId, patch);
    }
};
exports.DashboardsController = DashboardsController;
__decorate([
    (0, common_1.Get)('workspace/:workspaceId'),
    (0, common_1.UseGuards)(resource_member_guard_1.ResourceMemberGuard),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DashboardsController.prototype, "listPresets", null);
__decorate([
    (0, common_1.Get)('workspace/:workspaceId/default'),
    (0, common_1.UseGuards)(resource_member_guard_1.ResourceMemberGuard),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DashboardsController.prototype, "getDefaultPreset", null);
__decorate([
    (0, common_1.Put)('workspace/:workspaceId/preset/:presetId/workspace-default'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Param)('presetId', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], DashboardsController.prototype, "setWorkspaceDefault", null);
__decorate([
    (0, common_1.Delete)('workspace/:workspaceId/workspace-default'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DashboardsController.prototype, "clearWorkspaceDefault", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(resource_member_guard_1.ResourceMemberGuard),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dashboard_preset_dto_1.CreateDashboardPresetDto]),
    __metadata("design:returntype", void 0)
], DashboardsController.prototype, "createPreset", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, dashboard_preset_dto_1.UpdateDashboardPresetDto]),
    __metadata("design:returntype", void 0)
], DashboardsController.prototype, "updatePreset", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DashboardsController.prototype, "deletePreset", null);
__decorate([
    (0, common_1.Get)('dock/:workspaceId'),
    (0, common_1.UseGuards)(resource_member_guard_1.ResourceMemberGuard),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DashboardsController.prototype, "getDockConfig", null);
__decorate([
    (0, common_1.Post)('dock/:workspaceId'),
    (0, common_1.UseGuards)(resource_member_guard_1.ResourceMemberGuard),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], DashboardsController.prototype, "updateDockConfig", null);
exports.DashboardsController = DashboardsController = __decorate([
    (0, common_1.Controller)('dashboards'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [dashboards_service_1.DashboardsService])
], DashboardsController);
//# sourceMappingURL=dashboards.controller.js.map