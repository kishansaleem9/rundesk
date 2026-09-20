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
exports.MemberRolesController = exports.CustomRolesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const custom_roles_service_1 = require("./custom-roles.service");
/**
 * CRUD for the roles themselves, plus a catalog endpoint and a helper
 * for the current user to introspect their own effective permissions.
 */
let CustomRolesController = class CustomRolesController {
    constructor(roles) {
        this.roles = roles;
    }
    catalog() {
        return { permissions: this.roles.getCatalog() };
    }
    async myPermissions(workspaceId, user) {
        const resolution = await this.roles.resolveForUser(workspaceId, user.id);
        if (!resolution)
            return { permissions: [], legacyRole: 'guest', customRoleIds: [] };
        return resolution;
    }
    list(workspaceId) {
        return this.roles.list(workspaceId);
    }
    getOne(workspaceId, roleId) {
        return this.roles.getById(workspaceId, roleId);
    }
    async assignees(workspaceId, roleId) {
        return { workspaceMemberIds: await this.roles.listAssignees(workspaceId, roleId) };
    }
    create(workspaceId, body, user) {
        return this.roles.create(workspaceId, body, { id: user.id, email: user.email });
    }
    update(workspaceId, roleId, body, user) {
        return this.roles.update(workspaceId, roleId, body, { id: user.id, email: user.email });
    }
    async remove(workspaceId, roleId, user) {
        await this.roles.remove(workspaceId, roleId, { id: user.id, email: user.email });
        return { ok: true };
    }
};
exports.CustomRolesController = CustomRolesController;
__decorate([
    (0, common_1.Get)('catalog'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    (0, swagger_1.ApiOperation)({ summary: 'List every permission key the API understands' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CustomRolesController.prototype, "catalog", null);
__decorate([
    (0, common_1.Get)('me/permissions'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Effective permission set for the current user' }),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CustomRolesController.prototype, "myPermissions", null);
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CustomRolesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':roleId'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Param)('roleId', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], CustomRolesController.prototype, "getOne", null);
__decorate([
    (0, common_1.Get)(':roleId/assignees'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Param)('roleId', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], CustomRolesController.prototype, "assignees", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], CustomRolesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':roleId'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Param)('roleId', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], CustomRolesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':roleId'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Param)('roleId', new common_1.ParseUUIDPipe())),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], CustomRolesController.prototype, "remove", null);
exports.CustomRolesController = CustomRolesController = __decorate([
    (0, swagger_1.ApiTags)('custom-roles'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('workspaces/:workspaceId/roles'),
    __metadata("design:paramtypes", [custom_roles_service_1.CustomRolesService])
], CustomRolesController);
/**
 * Per-member role assignment lives at the natural URL
 * `/workspaces/:workspaceId/members/:memberId/roles`. Split out to
 * avoid the awkward `/roles/members/...` nesting.
 */
let MemberRolesController = class MemberRolesController {
    constructor(roles) {
        this.roles = roles;
    }
    async list(workspaceId, memberId) {
        return this.roles.listForMember(workspaceId, memberId);
    }
    async assign(workspaceId, memberId, roleId, user) {
        await this.roles.assign(workspaceId, memberId, roleId, { id: user.id, email: user.email });
        return { ok: true };
    }
    async unassign(workspaceId, memberId, roleId, user) {
        await this.roles.unassign(workspaceId, memberId, roleId, { id: user.id, email: user.email });
        return { ok: true };
    }
};
exports.MemberRolesController = MemberRolesController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Param)('memberId', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MemberRolesController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(':roleId'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Param)('memberId', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Param)('roleId', new common_1.ParseUUIDPipe())),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], MemberRolesController.prototype, "assign", null);
__decorate([
    (0, common_1.Delete)(':roleId'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Param)('memberId', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Param)('roleId', new common_1.ParseUUIDPipe())),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], MemberRolesController.prototype, "unassign", null);
exports.MemberRolesController = MemberRolesController = __decorate([
    (0, swagger_1.ApiTags)('custom-roles'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('workspaces/:workspaceId/members/:memberId/roles'),
    __metadata("design:paramtypes", [custom_roles_service_1.CustomRolesService])
], MemberRolesController);
//# sourceMappingURL=custom-roles.controller.js.map