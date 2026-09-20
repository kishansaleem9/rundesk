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
exports.FeatureFlagsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const feature_flags_service_1 = require("./feature-flags.service");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
let FeatureFlagsController = class FeatureFlagsController {
    constructor(featureFlagsService) {
        this.featureFlagsService = featureFlagsService;
    }
    async getResolved(user, workspaceId) {
        // workspaceId (optional) lets the client resolve flags for the workspace it
        // is viewing; the service verifies the caller can see it before honouring.
        return this.featureFlagsService.resolveForUserRequest(user, workspaceId);
    }
    async listWorkspaceOverrides(workspaceId) {
        return this.featureFlagsService.listOverrides(workspaceId);
    }
    /**
     * §2.8 gap 11 — ask the workspace admins to turn a feature on.
     *
     * Deliberately not under WorkspaceAdminGuard: the entire point is that the
     * caller is NOT an admin. The service checks membership and refuses to ask
     * for something already on.
     */
    async requestFlag(flagKey, body, user) {
        const workspaceId = body?.workspaceId || user?.activeWorkspaceId;
        if (!workspaceId)
            throw new common_1.BadRequestException('workspaceId is required');
        return this.featureFlagsService.requestFlag(flagKey, workspaceId, {
            id: user.id,
            name: user.name,
            email: user.email,
        });
    }
    async setFlag(flagKey, body, user) {
        if (typeof body?.enabled !== 'boolean') {
            throw new common_1.BadRequestException('enabled (boolean) is required');
        }
        if (!['global', 'workspace', 'role', 'user'].includes(body?.scope)) {
            throw new common_1.BadRequestException('scope must be one of: global, workspace, role, user');
        }
        if ((body.scope === 'workspace' && !body.workspaceId) || (body.scope === 'role' && !body.scopeId) || (body.scope === 'user' && !body.scopeId)) {
            throw new common_1.BadRequestException(`scope "${body.scope}" requires the corresponding id`);
        }
        // Authorization is enforced in the service: super_admin for global/role/user
        // scopes, workspace_admin of the target workspace for workspace scope.
        await this.featureFlagsService.setFlag(flagKey, body.enabled, body.scope, body.scopeId ?? null, body.workspaceId ?? null, { id: user.id, role: user.role });
        return { updated: true };
    }
};
exports.FeatureFlagsController = FeatureFlagsController;
__decorate([
    (0, common_1.Get)('resolved'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], FeatureFlagsController.prototype, "getResolved", null);
__decorate([
    (0, common_1.Get)('workspace/:workspaceId'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], FeatureFlagsController.prototype, "listWorkspaceOverrides", null);
__decorate([
    (0, common_1.Post)('request/:flagKey'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('flagKey')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], FeatureFlagsController.prototype, "requestFlag", null);
__decorate([
    (0, common_1.Put)(':flagKey'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('flagKey')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], FeatureFlagsController.prototype, "setFlag", null);
exports.FeatureFlagsController = FeatureFlagsController = __decorate([
    (0, swagger_1.ApiTags)('feature-flags'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('feature-flags'),
    __metadata("design:paramtypes", [feature_flags_service_1.FeatureFlagsService])
], FeatureFlagsController);
//# sourceMappingURL=feature-flags.controller.js.map