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
exports.PresenceMeController = exports.PresenceController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const presence_service_1 = require("./presence.service");
let PresenceController = class PresenceController {
    constructor(presence) {
        this.presence = presence;
    }
    list(workspaceId, user) {
        return this.presence.getWorkspacePresence(workspaceId, user.id);
    }
};
exports.PresenceController = PresenceController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PresenceController.prototype, "list", null);
exports.PresenceController = PresenceController = __decorate([
    (0, swagger_1.ApiTags)('presence'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('workspaces/:workspaceId/presence'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    __metadata("design:paramtypes", [presence_service_1.PresenceService])
], PresenceController);
/**
 * §A4.8 — a presence override belongs to the person, not to one workspace, so
 * it is set outside the workspace-scoped controller above.
 */
let PresenceMeController = class PresenceMeController {
    constructor(presence) {
        this.presence = presence;
    }
    setStatus(user, body) {
        return this.presence.setManualStatus(user.id, body?.status ?? null);
    }
    /**
     * §G06 [06:42] — the words that go with the dot.
     *
     * Separate from the availability above because they are separate answers:
     * "busy" is whether to interrupt, "🕌 Namaz break, back in 30" is what is
     * happening. Sending both empty clears the status.
     */
    setCustomStatus(user, body) {
        return this.presence.setCustomStatus(user.id, body ?? {});
    }
};
exports.PresenceMeController = PresenceMeController;
__decorate([
    (0, common_1.Put)('me'),
    (0, swagger_1.ApiOperation)({ summary: 'Set or clear your own presence status (null = derive from activity)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], PresenceMeController.prototype, "setStatus", null);
__decorate([
    (0, common_1.Put)('me/status'),
    (0, swagger_1.ApiOperation)({ summary: 'Set or clear your own custom status (emoji + text + expiry)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], PresenceMeController.prototype, "setCustomStatus", null);
exports.PresenceMeController = PresenceMeController = __decorate([
    (0, swagger_1.ApiTags)('presence'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('presence'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [presence_service_1.PresenceService])
], PresenceMeController);
//# sourceMappingURL=presence.controller.js.map