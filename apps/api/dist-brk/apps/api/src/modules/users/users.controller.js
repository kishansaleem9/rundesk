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
exports.UsersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const users_service_1 = require("./users.service");
let UsersController = class UsersController {
    constructor(users) {
        this.users = users;
    }
    async me(user) {
        const row = await this.users.findById(user.id);
        return row ? this.users.publicProfile(row) : null;
    }
    updateProfile(user, body) {
        return this.users.updateProfile(user.id, body);
    }
    presignAvatar(user, body) {
        return this.users.createAvatarUploadUrl(user.id, body);
    }
    changePassword(user, body) {
        return this.users.changePassword(user.id, body.currentPassword, body.newPassword);
    }
    exportData(user) {
        return this.users.exportUserData(user.id);
    }
    deleteMe(user, body) {
        return this.users.deleteAccount(user.id, body ?? {});
    }
    // Belt-and-suspenders POST alias — some HTTP clients/proxies drop DELETE
    // bodies, and the delete flow needs the emailed confirmation in the body.
    deleteMeViaPost(user, body) {
        return this.users.deleteAccount(user.id, body ?? {});
    }
    /**
     * §6 frame `087_0535` — the Notepad from Personal Tools.
     *
     * A scratch pad belongs to the person, not a workspace, so it hangs off
     * /users/me like their theme and their pinned tools rather than off a
     * workspace route that would strand a note when they switch.
     */
    async getNotepad(user) {
        return this.users.getNotepad(user.id);
    }
    async saveNotepad(user, body) {
        return this.users.saveNotepad(user.id, body?.content ?? '');
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, common_1.Get)('me'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "me", null);
__decorate([
    (0, common_1.Patch)('me'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "updateProfile", null);
__decorate([
    (0, common_1.Post)('me/avatar/presign'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "presignAvatar", null);
__decorate([
    (0, common_1.Post)('me/change-password'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "changePassword", null);
__decorate([
    (0, common_1.Get)('me/export'),
    (0, swagger_1.ApiOperation)({ summary: 'GDPR data export — a JSON bundle of the caller’s personal data (Plan §14.6)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "exportData", null);
__decorate([
    (0, common_1.Delete)('me'),
    (0, swagger_1.ApiOperation)({ summary: 'GDPR account deletion — irreversibly anonymize the caller’s account (Plan §14.6)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "deleteMe", null);
__decorate([
    (0, common_1.Post)('me/delete'),
    (0, swagger_1.ApiOperation)({ summary: 'GDPR account deletion (POST alias with confirmation body, Plan §14.6)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], UsersController.prototype, "deleteMeViaPost", null);
__decorate([
    (0, common_1.Get)('me/notepad'),
    (0, swagger_1.ApiOperation)({ summary: 'The signed-in person’s notepad' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getNotepad", null);
__decorate([
    (0, common_1.Put)('me/notepad'),
    (0, swagger_1.ApiOperation)({ summary: 'Save the notepad' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "saveNotepad", null);
exports.UsersController = UsersController = __decorate([
    (0, swagger_1.ApiTags)('users'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('users'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [users_service_1.UsersService])
], UsersController);
//# sourceMappingURL=users.controller.js.map