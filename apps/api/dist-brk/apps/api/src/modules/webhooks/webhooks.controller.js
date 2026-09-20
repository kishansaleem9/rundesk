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
exports.WebhooksController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const webhooks_service_1 = require("./webhooks.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const permissions_guard_1 = require("../custom-roles/permissions.guard");
const webhook_dto_1 = require("./dto/webhook.dto");
let WebhooksController = class WebhooksController {
    constructor(svc) {
        this.svc = svc;
    }
    events() {
        return this.svc.getAvailableEvents();
    }
    list(workspaceId) {
        return this.svc.list(workspaceId);
    }
    create(workspaceId, user, body) {
        return this.svc.create(workspaceId, user.id, body);
    }
    update(workspaceId, webhookId, body) {
        return this.svc.update(workspaceId, webhookId, body);
    }
    delete(workspaceId, webhookId) {
        return this.svc.delete(workspaceId, webhookId);
    }
    test(workspaceId, webhookId) {
        return this.svc.testWebhook(workspaceId, webhookId);
    }
    deliveries(workspaceId, webhookId) {
        return this.svc.listDeliveries(workspaceId, webhookId);
    }
};
exports.WebhooksController = WebhooksController;
__decorate([
    (0, common_1.Get)('events'),
    (0, swagger_1.ApiOperation)({ summary: 'List available webhook event types' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], WebhooksController.prototype, "events", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List all webhooks in a workspace' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WebhooksController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard, permissions_guard_1.PermissionsGuard),
    (0, permissions_guard_1.RequirePermissions)('webhook.manage'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new webhook (admin only)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, webhook_dto_1.CreateWebhookDto]),
    __metadata("design:returntype", void 0)
], WebhooksController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':webhookId'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard, permissions_guard_1.PermissionsGuard),
    (0, permissions_guard_1.RequirePermissions)('webhook.manage'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('webhookId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, webhook_dto_1.UpdateWebhookDto]),
    __metadata("design:returntype", void 0)
], WebhooksController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':webhookId'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard, permissions_guard_1.PermissionsGuard),
    (0, permissions_guard_1.RequirePermissions)('webhook.manage'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('webhookId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], WebhooksController.prototype, "delete", null);
__decorate([
    (0, common_1.Post)(':webhookId/test'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard, permissions_guard_1.PermissionsGuard),
    (0, permissions_guard_1.RequirePermissions)('webhook.manage'),
    (0, swagger_1.ApiOperation)({ summary: 'Send a test event to the webhook' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('webhookId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], WebhooksController.prototype, "test", null);
__decorate([
    (0, common_1.Get)(':webhookId/deliveries'),
    (0, swagger_1.ApiOperation)({ summary: 'List recent deliveries for a webhook' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('webhookId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], WebhooksController.prototype, "deliveries", null);
exports.WebhooksController = WebhooksController = __decorate([
    (0, swagger_1.ApiTags)('webhooks'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    (0, common_1.Controller)('workspaces/:workspaceId/webhooks'),
    __metadata("design:paramtypes", [webhooks_service_1.WebhooksService])
], WebhooksController);
//# sourceMappingURL=webhooks.controller.js.map