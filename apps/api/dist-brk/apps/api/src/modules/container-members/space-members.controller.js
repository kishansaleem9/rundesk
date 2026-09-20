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
exports.SpaceMembersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const container_members_service_1 = require("./container-members.service");
let SpaceMembersController = class SpaceMembersController {
    constructor(members) {
        this.members = members;
    }
    list(spaceId) {
        return this.members.listSpaceMembers(spaceId);
    }
    add(spaceId, user, body) {
        return this.members.addSpaceMember(spaceId, user.id, body.userId, body.role);
    }
    updateRole(spaceId, userId, user, body) {
        return this.members.updateSpaceMemberRole(spaceId, user.id, userId, body.role);
    }
    remove(spaceId, userId, user) {
        return this.members.removeSpaceMember(spaceId, user.id, userId);
    }
    setVisibility(spaceId, user, body) {
        return this.members.setSpaceVisibility(spaceId, user.id, body.visibility);
    }
};
exports.SpaceMembersController = SpaceMembersController;
__decorate([
    (0, common_1.Get)('members'),
    __param(0, (0, common_1.Param)('spaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SpaceMembersController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('members'),
    __param(0, (0, common_1.Param)('spaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], SpaceMembersController.prototype, "add", null);
__decorate([
    (0, common_1.Patch)('members/:userId'),
    __param(0, (0, common_1.Param)('spaceId')),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], SpaceMembersController.prototype, "updateRole", null);
__decorate([
    (0, common_1.Delete)('members/:userId'),
    __param(0, (0, common_1.Param)('spaceId')),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], SpaceMembersController.prototype, "remove", null);
__decorate([
    (0, common_1.Patch)('visibility'),
    __param(0, (0, common_1.Param)('spaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], SpaceMembersController.prototype, "setVisibility", null);
exports.SpaceMembersController = SpaceMembersController = __decorate([
    (0, swagger_1.ApiTags)('container-members'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('spaces/:spaceId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, resource_member_guard_1.ResourceMemberGuard),
    __metadata("design:paramtypes", [container_members_service_1.ContainerMembersService])
], SpaceMembersController);
//# sourceMappingURL=space-members.controller.js.map