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
exports.SecuritySettingsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const workspace_security_settings_service_1 = require("./workspace-security-settings.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
let SecuritySettingsController = class SecuritySettingsController {
    constructor(svc) {
        this.svc = svc;
    }
    async get(workspaceId, req) {
        const settings = await this.svc.get(workspaceId);
        return { ...settings, currentIp: req.ip };
    }
    async update(workspaceId, user, req, body) {
        const settings = await this.svc.update(workspaceId, body, user.id, req.ip);
        return { ...settings, currentIp: req.ip };
    }
};
exports.SecuritySettingsController = SecuritySettingsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get workspace security settings + the caller’s current IP' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SecuritySettingsController.prototype, "get", null);
__decorate([
    (0, common_1.Patch)(),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Update workspace security settings (admin only)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], SecuritySettingsController.prototype, "update", null);
exports.SecuritySettingsController = SecuritySettingsController = __decorate([
    (0, swagger_1.ApiTags)('security'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    (0, common_1.Controller)('workspaces/:workspaceId/security-settings'),
    __metadata("design:paramtypes", [workspace_security_settings_service_1.WorkspaceSecuritySettingsService])
], SecuritySettingsController);
//# sourceMappingURL=security-settings.controller.js.map