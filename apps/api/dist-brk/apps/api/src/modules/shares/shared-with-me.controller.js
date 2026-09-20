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
exports.SharedWithMeController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const shares_service_1 = require("./shares.service");
/**
 * A1.7 — the reverse of `SharesController`, which is keyed by an object you
 * already know. Workspace-scoped rather than share-scoped so it sits next to
 * the other `workspaces/:workspaceId/...` reads, and so the sidebar, the search
 * palette (A2.10) and the Docs hub (A5.6) can all call the same route.
 */
let SharedWithMeController = class SharedWithMeController {
    constructor(shares) {
        this.shares = shares;
    }
    list(workspaceId, user) {
        return this.shares.listSharedWithMe(workspaceId, user.id);
    }
};
exports.SharedWithMeController = SharedWithMeController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Everything in this workspace shared directly with the caller' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SharedWithMeController.prototype, "list", null);
exports.SharedWithMeController = SharedWithMeController = __decorate([
    (0, swagger_1.ApiTags)('shares'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    (0, common_1.Controller)('workspaces/:workspaceId/shared-with-me'),
    __metadata("design:paramtypes", [shares_service_1.SharesService])
], SharedWithMeController);
//# sourceMappingURL=shared-with-me.controller.js.map