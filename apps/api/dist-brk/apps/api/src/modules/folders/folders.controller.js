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
exports.FoldersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const permissions_guard_1 = require("../custom-roles/permissions.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const folders_service_1 = require("./folders.service");
let FoldersController = class FoldersController {
    constructor(folders) {
        this.folders = folders;
    }
    list(spaceId, user) {
        return this.folders.listBySpace(spaceId, { id: user.id, role: user.role });
    }
    create(spaceId, user, body) {
        return this.folders.create(spaceId, body, user.id);
    }
    update(spaceId, folderId, body) {
        return this.folders.update(spaceId, folderId, body);
    }
    /** Move the folder (and the projects it groups) into another space. */
    move(spaceId, folderId, body, user, ip) {
        return this.folders.move(spaceId, folderId, body.targetSpaceId, user.id, ip);
    }
    remove(spaceId, folderId, user, ip) {
        return this.folders.remove(spaceId, folderId, user.id, ip);
    }
};
exports.FoldersController = FoldersController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('spaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], FoldersController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, permissions_guard_1.RequirePermissions)('space.create'),
    __param(0, (0, common_1.Param)('spaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], FoldersController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':folderId'),
    (0, permissions_guard_1.RequirePermissions)('space.create'),
    __param(0, (0, common_1.Param)('spaceId')),
    __param(1, (0, common_1.Param)('folderId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], FoldersController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':folderId/move'),
    (0, permissions_guard_1.RequirePermissions)('space.create'),
    __param(0, (0, common_1.Param)('spaceId')),
    __param(1, (0, common_1.Param)('folderId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __param(4, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object, String]),
    __metadata("design:returntype", void 0)
], FoldersController.prototype, "move", null);
__decorate([
    (0, common_1.Delete)(':folderId'),
    (0, permissions_guard_1.RequirePermissions)('space.create'),
    __param(0, (0, common_1.Param)('spaceId')),
    __param(1, (0, common_1.Param)('folderId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, String]),
    __metadata("design:returntype", void 0)
], FoldersController.prototype, "remove", null);
exports.FoldersController = FoldersController = __decorate([
    (0, swagger_1.ApiTags)('folders'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('spaces/:spaceId/folders'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, resource_member_guard_1.ResourceMemberGuard, permissions_guard_1.PermissionsGuard),
    __metadata("design:paramtypes", [folders_service_1.FoldersService])
], FoldersController);
//# sourceMappingURL=folders.controller.js.map