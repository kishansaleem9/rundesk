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
exports.TeamsHubController = exports.WorkspaceGroupsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const workspace_groups_service_1 = require("./workspace-groups.service");
let WorkspaceGroupsController = class WorkspaceGroupsController {
    constructor(groups) {
        this.groups = groups;
    }
    list(workspaceId, search) {
        return this.groups.list(workspaceId, { search });
    }
    get(workspaceId, groupId) {
        return this.groups.get(workspaceId, groupId);
    }
    create(workspaceId, body, user) {
        return this.groups.create(workspaceId, user.id, body);
    }
    update(workspaceId, groupId, body, user) {
        return this.groups.update(workspaceId, groupId, user.id, body);
    }
    remove(workspaceId, groupId, user) {
        return this.groups.remove(workspaceId, groupId, user.id);
    }
    addMembers(workspaceId, groupId, body, user) {
        return this.groups.addMembers(workspaceId, groupId, user.id, body.userIds ?? []);
    }
    replaceMembers(workspaceId, groupId, body, user) {
        return this.groups.replaceMembers(workspaceId, groupId, user.id, body.userIds ?? []);
    }
    removeMember(workspaceId, groupId, userId, user) {
        return this.groups.removeMember(workspaceId, groupId, user.id, userId);
    }
};
exports.WorkspaceGroupsController = WorkspaceGroupsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Query)('search')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], WorkspaceGroupsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':groupId'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('groupId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], WorkspaceGroupsController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], WorkspaceGroupsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':groupId'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('groupId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], WorkspaceGroupsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':groupId'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('groupId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], WorkspaceGroupsController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':groupId/members'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('groupId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], WorkspaceGroupsController.prototype, "addMembers", null);
__decorate([
    (0, common_1.Put)(':groupId/members'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('groupId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], WorkspaceGroupsController.prototype, "replaceMembers", null);
__decorate([
    (0, common_1.Delete)(':groupId/members/:userId'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('groupId')),
    __param(2, (0, common_1.Param)('userId')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", void 0)
], WorkspaceGroupsController.prototype, "removeMember", null);
exports.WorkspaceGroupsController = WorkspaceGroupsController = __decorate([
    (0, swagger_1.ApiTags)('workspace-groups'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('workspaces/:workspaceId/groups'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    __metadata("design:paramtypes", [workspace_groups_service_1.WorkspaceGroupsService])
], WorkspaceGroupsController);
/**
 * §V2-12 — the Teams Hub itself, as opposed to one team.
 *
 * A separate controller under `/workspaces/:id/teams` rather than more routes
 * on `/groups`, because none of this is about a group: the person cards at
 * frame `21:00` are per MEMBER, and half the people on that screen are in no
 * team at all. Hanging them off `/groups/:groupId/...` would have forced the
 * page to invent a group id it does not have.
 *
 * `WorkspaceMemberGuard`, not admin — the entire point of §V2-12 was that
 * looking at your own organisation stopped requiring admin rights. The one
 * write here does its own permission check (yours, or an admin's), because
 * "only admins" and "yours or an admin's" are different rules and a guard
 * cannot express the second.
 */
let TeamsHubController = class TeamsHubController {
    constructor(groups) {
        this.groups = groups;
    }
    /** Everyone in the workspace, with the work each of them actually has open. */
    workPreview(workspaceId, perPerson) {
        return this.groups.workPreview(workspaceId, {
            perPerson: perPerson ? Number(perPerson) : undefined,
        });
    }
    /** The line under the name on a person card. */
    setJobTitle(workspaceId, userId, body, user) {
        return this.groups.setJobTitle(workspaceId, user.id, userId, body?.jobTitle ?? null);
    }
};
exports.TeamsHubController = TeamsHubController;
__decorate([
    (0, common_1.Get)('work-preview'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Query)('perPerson')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TeamsHubController.prototype, "workPreview", null);
__decorate([
    (0, common_1.Put)('people/:userId/title'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], TeamsHubController.prototype, "setJobTitle", null);
exports.TeamsHubController = TeamsHubController = __decorate([
    (0, swagger_1.ApiTags)('workspace-groups'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('workspaces/:workspaceId/teams'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    __metadata("design:paramtypes", [workspace_groups_service_1.WorkspaceGroupsService])
], TeamsHubController);
//# sourceMappingURL=workspace-groups.controller.js.map