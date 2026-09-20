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
exports.ProjectMembersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const container_members_service_1 = require("./container-members.service");
let ProjectMembersController = class ProjectMembersController {
    constructor(members) {
        this.members = members;
    }
    list(projectId) {
        return this.members.listProjectMembers(projectId);
    }
    add(projectId, user, body) {
        return this.members.addProjectMember(projectId, user.id, body.userId, body.role);
    }
    updateRole(projectId, userId, user, body) {
        return this.members.updateProjectMemberRole(projectId, user.id, userId, body.role);
    }
    remove(projectId, userId, user) {
        return this.members.removeProjectMember(projectId, user.id, userId);
    }
    setVisibility(projectId, user, body) {
        return this.members.setProjectVisibility(projectId, user.id, body.visibility);
    }
};
exports.ProjectMembersController = ProjectMembersController;
__decorate([
    (0, common_1.Get)('members'),
    __param(0, (0, common_1.Param)('projectId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ProjectMembersController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('members'),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ProjectMembersController.prototype, "add", null);
__decorate([
    (0, common_1.Patch)('members/:userId'),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], ProjectMembersController.prototype, "updateRole", null);
__decorate([
    (0, common_1.Delete)('members/:userId'),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], ProjectMembersController.prototype, "remove", null);
__decorate([
    (0, common_1.Patch)('visibility'),
    __param(0, (0, common_1.Param)('projectId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ProjectMembersController.prototype, "setVisibility", null);
exports.ProjectMembersController = ProjectMembersController = __decorate([
    (0, swagger_1.ApiTags)('container-members'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('projects/:projectId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, resource_member_guard_1.ResourceMemberGuard),
    __metadata("design:paramtypes", [container_members_service_1.ContainerMembersService])
], ProjectMembersController);
//# sourceMappingURL=project-members.controller.js.map