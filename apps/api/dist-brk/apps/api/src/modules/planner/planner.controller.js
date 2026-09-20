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
exports.PlannerController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const planner_service_1 = require("./planner.service");
/**
 * §V2-02 — the Planner, frame `13:08`.
 *
 * `WorkspaceMemberGuard`, and then everything is scoped to `user.id` inside
 * the service. There is no route here that reads another person's blocks:
 * `[14:56]` "yeh MERI planner pe show honge" — a planner is one person's plan
 * for their own week, and a manager who could open yours would be looking at
 * your day rather than at your work.
 */
let PlannerController = class PlannerController {
    constructor(planner) {
        this.planner = planner;
    }
    /** The grid's read: `[from, to)`, half-open so two weeks never double-count. */
    listBlocks(workspaceId, user, from, to) {
        return this.planner.listBlocks(workspaceId, user.id, from, to);
    }
    createBlock(workspaceId, user, body) {
        return this.planner.createBlock(workspaceId, user.id, body);
    }
    updateBlock(blockId, user, body) {
        return this.planner.updateBlock(blockId, user.id, body);
    }
    deleteBlock(blockId, user) {
        return this.planner.deleteBlock(blockId, user.id);
    }
    /** Frame `14:10` — Appearance and Time blocking. Per person, not per space. */
    getSettings(user) {
        return this.planner.getSettings(user.id);
    }
    updateSettings(user, body) {
        return this.planner.updateSettings(user.id, body);
    }
};
exports.PlannerController = PlannerController;
__decorate([
    (0, common_1.Get)('blocks'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('from')),
    __param(3, (0, common_1.Query)('to')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String]),
    __metadata("design:returntype", void 0)
], PlannerController.prototype, "listBlocks", null);
__decorate([
    (0, common_1.Post)('blocks'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], PlannerController.prototype, "createBlock", null);
__decorate([
    (0, common_1.Patch)('blocks/:blockId'),
    __param(0, (0, common_1.Param)('blockId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], PlannerController.prototype, "updateBlock", null);
__decorate([
    (0, common_1.Delete)('blocks/:blockId'),
    __param(0, (0, common_1.Param)('blockId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PlannerController.prototype, "deleteBlock", null);
__decorate([
    (0, common_1.Get)('settings'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PlannerController.prototype, "getSettings", null);
__decorate([
    (0, common_1.Patch)('settings'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], PlannerController.prototype, "updateSettings", null);
exports.PlannerController = PlannerController = __decorate([
    (0, swagger_1.ApiTags)('planner'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('planner/:workspaceId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    __metadata("design:paramtypes", [planner_service_1.PlannerService])
], PlannerController);
//# sourceMappingURL=planner.controller.js.map