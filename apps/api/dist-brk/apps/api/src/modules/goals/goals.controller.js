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
exports.GoalsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const feature_flag_guard_1 = require("../../common/guards/feature-flag.guard");
const feature_flag_decorator_1 = require("../../common/decorators/feature-flag.decorator");
const feature_flags_1 = require("@rundesk/feature-flags");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const goals_service_1 = require("./goals.service");
// FeatureFlagGuard enforces the Goals ClickApp — a workspace that turns Goals
// off gets 404s here. GOALS is default-enabled, so existing workspaces keep it.
let GoalsController = class GoalsController {
    constructor(goals) {
        this.goals = goals;
    }
    list(workspaceId, spaceId, parentGoalId) {
        return this.goals.list(workspaceId, {
            spaceId: spaceId === 'null' ? null : spaceId,
            parentGoalId: parentGoalId === 'null' ? null : parentGoalId,
        });
    }
    create(workspaceId, user, body) {
        return this.goals.create({
            workspaceId,
            title: body.title,
            description: body.description,
            spaceId: body.spaceId,
            parentGoalId: body.parentGoalId,
            kind: body.kind,
            targetValue: body.targetValue,
            unit: body.unit,
            startDate: body.startDate ? new Date(body.startDate) : null,
            dueDate: body.dueDate ? new Date(body.dueDate) : null,
            ownerId: body.ownerId ?? user.id,
        });
    }
    update(goalId, user, body) {
        return this.goals.update(goalId, {
            ...body,
            startDate: body.startDate ? new Date(body.startDate) : body.startDate,
            dueDate: body.dueDate ? new Date(body.dueDate) : body.dueDate,
        }, user.id);
    }
    getOne(goalId) {
        return this.goals.getOne(goalId);
    }
    remove(goalId) {
        return this.goals.delete(goalId);
    }
    history(goalId) {
        return this.goals.history(goalId);
    }
    // ─── Key results ───────────────────────────────────────────────────────────
    listKeyResults(goalId) {
        return this.goals.listKeyResults(goalId);
    }
    createKeyResult(goalId, body) {
        return this.goals.createKeyResult(goalId, body);
    }
    updateKeyResult(krId, body) {
        return this.goals.updateKeyResult(krId, body);
    }
    deleteKeyResult(krId) {
        return this.goals.deleteKeyResult(krId);
    }
};
exports.GoalsController = GoalsController;
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/goals'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Query)('spaceId')),
    __param(2, (0, common_1.Query)('parentGoalId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], GoalsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('workspaces/:workspaceId/goals'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], GoalsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)('goals/:goalId'),
    __param(0, (0, common_1.Param)('goalId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], GoalsController.prototype, "update", null);
__decorate([
    (0, common_1.Get)('goals/:goalId'),
    __param(0, (0, common_1.Param)('goalId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], GoalsController.prototype, "getOne", null);
__decorate([
    (0, common_1.Delete)('goals/:goalId'),
    __param(0, (0, common_1.Param)('goalId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], GoalsController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)('goals/:goalId/history'),
    __param(0, (0, common_1.Param)('goalId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], GoalsController.prototype, "history", null);
__decorate([
    (0, common_1.Get)('goals/:goalId/key-results'),
    __param(0, (0, common_1.Param)('goalId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], GoalsController.prototype, "listKeyResults", null);
__decorate([
    (0, common_1.Post)('goals/:goalId/key-results'),
    __param(0, (0, common_1.Param)('goalId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], GoalsController.prototype, "createKeyResult", null);
__decorate([
    (0, common_1.Patch)('goals/:goalId/key-results/:krId'),
    __param(0, (0, common_1.Param)('krId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], GoalsController.prototype, "updateKeyResult", null);
__decorate([
    (0, common_1.Delete)('goals/:goalId/key-results/:krId'),
    __param(0, (0, common_1.Param)('krId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], GoalsController.prototype, "deleteKeyResult", null);
exports.GoalsController = GoalsController = __decorate([
    (0, swagger_1.ApiTags)('goals'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, resource_member_guard_1.ResourceMemberGuard, feature_flag_guard_1.FeatureFlagGuard),
    (0, feature_flag_decorator_1.FeatureFlag)(feature_flags_1.FLAGS.GOALS),
    __metadata("design:paramtypes", [goals_service_1.GoalsService])
], GoalsController);
//# sourceMappingURL=goals.controller.js.map