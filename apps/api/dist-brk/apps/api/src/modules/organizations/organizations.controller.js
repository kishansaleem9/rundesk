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
exports.OrganizationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const organization_member_guard_1 = require("../auth/guards/organization-member.guard");
const organization_admin_guard_1 = require("../auth/guards/organization-admin.guard");
const organizations_service_1 = require("./organizations.service");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
let OrganizationsController = class OrganizationsController {
    constructor(organizationsService) {
        this.organizationsService = organizationsService;
    }
    async list(user) {
        if (user.role !== 'super_admin')
            throw new common_1.ForbiddenException('Super admin access required');
        return this.organizationsService.listAll();
    }
    // NOTE: this static route MUST be declared before `:organizationId` below, or
    // Nest/Express would match `/organizations/users` against the param route.
    async listDirectory(user, q, limit, offset) {
        if (user.role !== 'super_admin')
            throw new common_1.ForbiddenException('Super admin access required');
        return this.organizationsService.listDirectory({
            q,
            limit: limit != null ? Number(limit) : undefined,
            offset: offset != null ? Number(offset) : undefined,
        });
    }
    async get(id) {
        return this.organizationsService.findById(id);
    }
    async update(id, body) {
        return this.organizationsService.update(id, body);
    }
    async listMembers(id) {
        return this.organizationsService.listMembers(id);
    }
    async listWorkspaces(id) {
        return this.organizationsService.listWorkspaces(id);
    }
    async updateMemberRole(orgId, userId, body, user) {
        return this.organizationsService.updateMemberRole(orgId, userId, body.role, user.id);
    }
    async removeMember(orgId, userId) {
        return this.organizationsService.removeMember(orgId, userId);
    }
    async leave(orgId, user) {
        return this.organizationsService.leaveOrganization(orgId, user.id);
    }
};
exports.OrganizationsController = OrganizationsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List all organizations (super admin)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OrganizationsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('users'),
    (0, swagger_1.ApiOperation)({ summary: 'Global user directory — all platform users (super admin)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('q')),
    __param(2, (0, common_1.Query)('limit')),
    __param(3, (0, common_1.Query)('offset')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], OrganizationsController.prototype, "listDirectory", null);
__decorate([
    (0, common_1.Get)(':organizationId'),
    (0, common_1.UseGuards)(organization_member_guard_1.OrganizationMemberGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Get organization metadata' }),
    __param(0, (0, common_1.Param)('organizationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], OrganizationsController.prototype, "get", null);
__decorate([
    (0, common_1.Patch)(':organizationId'),
    (0, common_1.UseGuards)(organization_admin_guard_1.OrganizationAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Update organization name or logo' }),
    __param(0, (0, common_1.Param)('organizationId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], OrganizationsController.prototype, "update", null);
__decorate([
    (0, common_1.Get)(':organizationId/members'),
    (0, common_1.UseGuards)(organization_member_guard_1.OrganizationMemberGuard),
    (0, swagger_1.ApiOperation)({ summary: 'List organization members' }),
    __param(0, (0, common_1.Param)('organizationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], OrganizationsController.prototype, "listMembers", null);
__decorate([
    (0, common_1.Get)(':organizationId/workspaces'),
    (0, common_1.UseGuards)(organization_admin_guard_1.OrganizationAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'List all workspaces in the organization (admin view)' }),
    __param(0, (0, common_1.Param)('organizationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], OrganizationsController.prototype, "listWorkspaces", null);
__decorate([
    (0, common_1.Post)(':organizationId/members/:userId/role'),
    (0, common_1.UseGuards)(organization_admin_guard_1.OrganizationAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Update a member role' }),
    __param(0, (0, common_1.Param)('organizationId')),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], OrganizationsController.prototype, "updateMemberRole", null);
__decorate([
    (0, common_1.Delete)(':organizationId/members/:userId'),
    (0, common_1.UseGuards)(organization_admin_guard_1.OrganizationAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Remove a member from the organization' }),
    __param(0, (0, common_1.Param)('organizationId')),
    __param(1, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], OrganizationsController.prototype, "removeMember", null);
__decorate([
    (0, common_1.Post)(':organizationId/leave'),
    (0, common_1.UseGuards)(organization_member_guard_1.OrganizationMemberGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Self-remove from organization' }),
    __param(0, (0, common_1.Param)('organizationId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], OrganizationsController.prototype, "leave", null);
exports.OrganizationsController = OrganizationsController = __decorate([
    (0, swagger_1.ApiTags)('organizations'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('organizations'),
    __metadata("design:paramtypes", [organizations_service_1.OrganizationsService])
], OrganizationsController);
//# sourceMappingURL=organizations.controller.js.map