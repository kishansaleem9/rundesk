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
exports.SharesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const shares_service_1 = require("./shares.service");
/**
 * Share & Permissions for every object type — space, folder, project, list,
 * task and doc all use the same routes, so one panel in the UI serves them all.
 * Membership/permission checks live in the service (a guest may never share).
 */
let SharesController = class SharesController {
    constructor(shares) {
        this.shares = shares;
    }
    async list(objectType, objectId, user) {
        const type = this.shares.assertType(objectType);
        const [items, mine, canShare] = await Promise.all([
            this.shares.list(type, objectId, user),
            this.shares.resolveLevel(type, objectId, user.id),
            this.shares.canShare(type, objectId, user).then((r) => r.allowed),
        ]);
        return { items, myLevel: mine, canShare, levels: shares_service_1.SHARE_LEVELS, types: shares_service_1.SHARE_TYPES };
    }
    async share(objectType, objectId, user, ip, body) {
        return this.shares.share(this.shares.assertType(objectType), objectId, user, body, ip);
    }
    async updateLevel(objectType, objectId, shareId, user, ip, body) {
        return this.shares.updateLevel(this.shares.assertType(objectType), objectId, shareId, user, body.level, ip);
    }
    /**
     * §G10 [12:16–12:20] — ask the people who can grant it.
     *
     * Deliberately NOT under the permission check the other routes share: the
     * whole point is that the caller cannot see this object. It needs only a
     * workspace membership, which the service establishes by looking the object
     * up inside `workspaceId`.
     */
    async request(objectType, objectId, body, user) {
        return this.shares.requestAccess(body.workspaceId, this.shares.assertType(objectType), objectId, { id: user.id, name: user.displayName, email: user.email });
    }
    async revoke(objectType, objectId, shareId, user, ip) {
        return this.shares.revoke(this.shares.assertType(objectType), objectId, shareId, user, ip);
    }
};
exports.SharesController = SharesController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Who this object is shared with, plus the caller’s own level' }),
    __param(0, (0, common_1.Param)('objectType')),
    __param(1, (0, common_1.Param)('objectId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], SharesController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Share with a workspace member (userId) or an outsider (email)' }),
    __param(0, (0, common_1.Param)('objectType')),
    __param(1, (0, common_1.Param)('objectId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Ip)()),
    __param(4, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, String, Object]),
    __metadata("design:returntype", Promise)
], SharesController.prototype, "share", null);
__decorate([
    (0, common_1.Patch)(':shareId'),
    (0, swagger_1.ApiOperation)({ summary: 'Change one person’s permission level' }),
    __param(0, (0, common_1.Param)('objectType')),
    __param(1, (0, common_1.Param)('objectId')),
    __param(2, (0, common_1.Param)('shareId')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __param(4, (0, common_1.Ip)()),
    __param(5, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object, String, Object]),
    __metadata("design:returntype", Promise)
], SharesController.prototype, "updateLevel", null);
__decorate([
    (0, common_1.Post)('request'),
    (0, swagger_1.ApiOperation)({ summary: 'Ask whoever can grant it for access to this object' }),
    __param(0, (0, common_1.Param)('objectType')),
    __param(1, (0, common_1.Param)('objectId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", Promise)
], SharesController.prototype, "request", null);
__decorate([
    (0, common_1.Delete)(':shareId'),
    (0, swagger_1.ApiOperation)({ summary: 'Revoke access' }),
    __param(0, (0, common_1.Param)('objectType')),
    __param(1, (0, common_1.Param)('objectId')),
    __param(2, (0, common_1.Param)('shareId')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __param(4, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object, String]),
    __metadata("design:returntype", Promise)
], SharesController.prototype, "revoke", null);
exports.SharesController = SharesController = __decorate([
    (0, swagger_1.ApiTags)('shares'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('shares/:objectType/:objectId'),
    __metadata("design:paramtypes", [shares_service_1.SharesService])
], SharesController);
//# sourceMappingURL=shares.controller.js.map