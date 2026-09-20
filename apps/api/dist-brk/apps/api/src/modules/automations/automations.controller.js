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
exports.AutomationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const automations_service_1 = require("./automations.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
const feature_flag_guard_1 = require("../../common/guards/feature-flag.guard");
const feature_flag_decorator_1 = require("../../common/decorators/feature-flag.decorator");
const feature_flags_1 = require("@rundesk/feature-flags");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
// FeatureFlagGuard enforces the Automations ClickApp — a workspace that turns
// Automations off gets 404s here. AI_AUTOMATIONS is default-enabled.
let AutomationsController = class AutomationsController {
    constructor(svc) {
        this.svc = svc;
    }
    list(workspaceId) {
        return this.svc.list(workspaceId);
    }
    create(workspaceId, user, body) {
        return this.svc.create(workspaceId, user.id, body);
    }
    getOne(workspaceId, automationId) {
        return this.svc.getOne(workspaceId, automationId);
    }
    update(workspaceId, automationId, body) {
        return this.svc.update(workspaceId, automationId, body);
    }
    remove(workspaceId, automationId) {
        return this.svc.remove(workspaceId, automationId);
    }
    listRuns(workspaceId, automationId) {
        return this.svc.listRuns(workspaceId, automationId);
    }
};
exports.AutomationsController = AutomationsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List all automations in a workspace' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AutomationsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Create an automation rule (admin only)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], AutomationsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':automationId'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('automationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AutomationsController.prototype, "getOne", null);
__decorate([
    (0, common_1.Patch)(':automationId'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('automationId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], AutomationsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':automationId'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('automationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AutomationsController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)(':automationId/runs'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('automationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AutomationsController.prototype, "listRuns", null);
exports.AutomationsController = AutomationsController = __decorate([
    (0, swagger_1.ApiTags)('automations'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard, feature_flag_guard_1.FeatureFlagGuard),
    (0, feature_flag_decorator_1.FeatureFlag)(feature_flags_1.FLAGS.AI_AUTOMATIONS),
    (0, common_1.Controller)('workspaces/:workspaceId/automations'),
    __metadata("design:paramtypes", [automations_service_1.AutomationsService])
], AutomationsController);
//# sourceMappingURL=automations.controller.js.map