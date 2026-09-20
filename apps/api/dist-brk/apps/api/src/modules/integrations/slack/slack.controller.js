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
exports.SlackController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const slack_service_1 = require("./slack.service");
const jwt_auth_guard_1 = require("../../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../../auth/guards/workspace-admin.guard");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
let SlackController = class SlackController {
    constructor(slack) {
        this.slack = slack;
    }
    get(workspaceId) {
        return this.slack.get(workspaceId);
    }
    connect(workspaceId, user, body) {
        return this.slack.connect(workspaceId, user.id, body);
    }
    update(workspaceId, body) {
        return this.slack.update(workspaceId, body);
    }
    disconnect(workspaceId) {
        return this.slack.disconnect(workspaceId);
    }
    test(workspaceId) {
        return this.slack.test(workspaceId);
    }
    listRules(workspaceId) {
        return this.slack.listRules(workspaceId);
    }
    addRule(workspaceId, user, body) {
        return this.slack.addRule(workspaceId, user.id, body);
    }
    removeRule(workspaceId, ruleId) {
        return this.slack.removeRule(ruleId, workspaceId);
    }
};
exports.SlackController = SlackController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get current Slack integration status' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SlackController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Connect or update Slack integration (admin only)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], SlackController.prototype, "connect", null);
__decorate([
    (0, common_1.Patch)(),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Update Slack integration settings (admin only)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SlackController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Disconnect Slack integration (admin only)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SlackController.prototype, "disconnect", null);
__decorate([
    (0, common_1.Post)('test'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Send a test message to verify Slack works' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SlackController.prototype, "test", null);
__decorate([
    (0, common_1.Get)('rules'),
    (0, swagger_1.ApiOperation)({ summary: 'List per-channel Slack routing rules' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SlackController.prototype, "listRules", null);
__decorate([
    (0, common_1.Post)('rules'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Add a per-channel Slack routing rule (admin only)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], SlackController.prototype, "addRule", null);
__decorate([
    (0, common_1.Delete)('rules/:ruleId'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a Slack routing rule (admin only)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('ruleId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], SlackController.prototype, "removeRule", null);
exports.SlackController = SlackController = __decorate([
    (0, swagger_1.ApiTags)('integrations:slack'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    (0, common_1.Controller)('workspaces/:workspaceId/integrations/slack'),
    __metadata("design:paramtypes", [slack_service_1.SlackService])
], SlackController);
//# sourceMappingURL=slack.controller.js.map