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
exports.IntegrationConnectionsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const integration_connections_service_1 = require("./integration-connections.service");
const jwt_auth_guard_1 = require("../../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../../auth/guards/workspace-admin.guard");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
const permissions_guard_1 = require("../../custom-roles/permissions.guard");
let IntegrationConnectionsController = class IntegrationConnectionsController {
    constructor(svc) {
        this.svc = svc;
    }
    list(workspaceId) {
        return this.svc.list(workspaceId);
    }
    providers() {
        return this.svc.listSupportedProviders();
    }
    providerStatus() {
        return this.svc.listProviderAvailability();
    }
    listAccessRequests(workspaceId) {
        return this.svc.listAccessRequests(workspaceId);
    }
    requestAccess(workspaceId, user, provider, note) {
        return this.svc.requestAccess(workspaceId, user.id, provider, note);
    }
    setAccessRequestStatus(workspaceId, provider, body, user) {
        return this.svc.setAccessRequestStatus(workspaceId, provider, body.status, body.note, user.id);
    }
    oauthStart(workspaceId, provider, user) {
        return this.svc.getOAuthStartUrl(workspaceId, user.id, provider);
    }
    async oauthCallback(provider, code, state, ip, reply) {
        try {
            const result = await this.svc.handleOAuthCallback(provider, code, state, ip);
            return reply.redirect(this.svc.getSuccessRedirect(result.workspaceId, result.provider), 302);
        }
        catch (error) {
            /*
             * §V2-11 frame `18:39` — "Google gave us this error: …".
             *
             * The provider's own message is written against the integration it
             * belongs to BEFORE the redirect, so the card survives the page load
             * that used to be the only place it existed. `peekState` re-reads the
             * signed state the failed attempt carried; when even that is unreadable
             * there is no integration to attach anything to and the old app-root
             * redirect is all that is left.
             */
            const reason = error?.message ?? 'oauth_callback_failed';
            const ctx = state ? this.svc.peekState(state) : null;
            if (ctx) {
                await this.svc.recordFailure(ctx.workspaceId, ctx.provider, reason).catch(() => undefined);
            }
            return reply.redirect(this.svc.getFailureRedirect(reason, { workspaceId: ctx?.workspaceId, provider: ctx?.provider ?? provider }), 302);
        }
    }
    disconnect(workspaceId, provider, user) {
        return this.svc.disconnect(workspaceId, provider, user.id);
    }
};
exports.IntegrationConnectionsController = IntegrationConnectionsController;
__decorate([
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    (0, common_1.Get)('workspaces/:workspaceId/integrations/connections'),
    (0, swagger_1.ApiOperation)({ summary: 'List workspace integration connections' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], IntegrationConnectionsController.prototype, "list", null);
__decorate([
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    (0, common_1.Get)('workspaces/:workspaceId/integrations/connections/providers'),
    (0, swagger_1.ApiOperation)({ summary: 'List OAuth providers supported by backend' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], IntegrationConnectionsController.prototype, "providers", null);
__decorate([
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    (0, common_1.Get)('workspaces/:workspaceId/integrations/connections/providers/status'),
    (0, swagger_1.ApiOperation)({ summary: 'List OAuth provider availability status' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], IntegrationConnectionsController.prototype, "providerStatus", null);
__decorate([
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    (0, common_1.Get)('workspaces/:workspaceId/integrations/connections/access-requests'),
    (0, swagger_1.ApiOperation)({ summary: 'List access requests for unsupported providers' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], IntegrationConnectionsController.prototype, "listAccessRequests", null);
__decorate([
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    (0, common_1.Post)('workspaces/:workspaceId/integrations/connections/access-requests'),
    (0, swagger_1.ApiOperation)({ summary: 'Create access request for unsupported provider' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('provider')),
    __param(3, (0, common_1.Query)('note')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String]),
    __metadata("design:returntype", void 0)
], IntegrationConnectionsController.prototype, "requestAccess", null);
__decorate([
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard, workspace_admin_guard_1.WorkspaceAdminGuard, permissions_guard_1.PermissionsGuard),
    (0, permissions_guard_1.RequirePermissions)('integrations.access_requests.manage'),
    (0, common_1.Patch)('workspaces/:workspaceId/integrations/connections/access-requests/:provider'),
    (0, swagger_1.ApiOperation)({ summary: 'Update access request status' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('provider')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], IntegrationConnectionsController.prototype, "setAccessRequestStatus", null);
__decorate([
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard, workspace_admin_guard_1.WorkspaceAdminGuard, permissions_guard_1.PermissionsGuard),
    (0, permissions_guard_1.RequirePermissions)('integrations.manage'),
    (0, common_1.Post)('workspaces/:workspaceId/integrations/connections/:provider/oauth/start'),
    (0, swagger_1.ApiOperation)({ summary: 'Create OAuth authorization URL for a provider' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('provider')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], IntegrationConnectionsController.prototype, "oauthStart", null);
__decorate([
    (0, common_1.Get)('integrations/oauth/:provider/callback'),
    (0, swagger_1.ApiOperation)({ summary: 'OAuth callback for workspace integrations' }),
    __param(0, (0, common_1.Param)('provider')),
    __param(1, (0, common_1.Query)('code')),
    __param(2, (0, common_1.Query)('state')),
    __param(3, (0, common_1.Ip)()),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], IntegrationConnectionsController.prototype, "oauthCallback", null);
__decorate([
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard, workspace_admin_guard_1.WorkspaceAdminGuard, permissions_guard_1.PermissionsGuard),
    (0, permissions_guard_1.RequirePermissions)('integrations.manage'),
    (0, common_1.Delete)('workspaces/:workspaceId/integrations/connections/:provider'),
    (0, swagger_1.ApiOperation)({ summary: 'Disconnect a provider from workspace' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('provider')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], IntegrationConnectionsController.prototype, "disconnect", null);
exports.IntegrationConnectionsController = IntegrationConnectionsController = __decorate([
    (0, swagger_1.ApiTags)('integrations:connections'),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [integration_connections_service_1.IntegrationConnectionsService])
], IntegrationConnectionsController);
//# sourceMappingURL=integration-connections.controller.js.map