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
exports.SprintsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const feature_flag_guard_1 = require("../../common/guards/feature-flag.guard");
const feature_flag_decorator_1 = require("../../common/decorators/feature-flag.decorator");
const feature_flags_1 = require("@rundesk/feature-flags");
const sprints_service_1 = require("./sprints.service");
const sprint_dto_1 = require("./dto/sprint.dto");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
// FeatureFlagGuard enforces the Sprints ClickApp — a workspace that turns
// Sprints off gets 404s here. SPRINTS is default-enabled.
let SprintsController = class SprintsController {
    constructor(sprints) {
        this.sprints = sprints;
    }
    list(workspaceId, user) {
        return this.sprints.list(workspaceId, { id: user.id, role: user.role });
    }
    create(workspaceId, body) {
        return this.sprints.create({
            workspaceId,
            spaceId: body.spaceId,
            name: body.name,
            goal: body.goal,
            startDate: new Date(body.startDate),
            endDate: new Date(body.endDate),
        });
    }
    get(sprintId, user) {
        return this.sprints.getDetail(sprintId, { id: user.id, role: user.role });
    }
    update(sprintId, body) {
        return this.sprints.update(sprintId, {
            ...body,
            startDate: body.startDate ? new Date(body.startDate) : undefined,
            endDate: body.endDate ? new Date(body.endDate) : undefined,
        });
    }
    remove(sprintId) {
        return this.sprints.delete(sprintId);
    }
    listTasks(sprintId, user) {
        return this.sprints.listTasks(sprintId, { id: user.id, role: user.role });
    }
    addTask(sprintId, body) {
        return this.sprints.addTask(sprintId, body.taskId, body.storyPoints);
    }
    removeTask(sprintId, taskId) {
        return this.sprints.removeTask(sprintId, taskId);
    }
};
exports.SprintsController = SprintsController;
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/sprints'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SprintsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('workspaces/:workspaceId/sprints'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, sprint_dto_1.CreateSprintDto]),
    __metadata("design:returntype", void 0)
], SprintsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('sprints/:sprintId'),
    __param(0, (0, common_1.Param)('sprintId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SprintsController.prototype, "get", null);
__decorate([
    (0, common_1.Patch)('sprints/:sprintId'),
    __param(0, (0, common_1.Param)('sprintId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SprintsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)('sprints/:sprintId'),
    __param(0, (0, common_1.Param)('sprintId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SprintsController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)('sprints/:sprintId/tasks'),
    __param(0, (0, common_1.Param)('sprintId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SprintsController.prototype, "listTasks", null);
__decorate([
    (0, common_1.Post)('sprints/:sprintId/tasks'),
    __param(0, (0, common_1.Param)('sprintId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SprintsController.prototype, "addTask", null);
__decorate([
    (0, common_1.Delete)('sprints/:sprintId/tasks/:taskId'),
    __param(0, (0, common_1.Param)('sprintId')),
    __param(1, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], SprintsController.prototype, "removeTask", null);
exports.SprintsController = SprintsController = __decorate([
    (0, swagger_1.ApiTags)('sprints'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, resource_member_guard_1.ResourceMemberGuard, feature_flag_guard_1.FeatureFlagGuard),
    (0, feature_flag_decorator_1.FeatureFlag)(feature_flags_1.FLAGS.SPRINTS),
    __metadata("design:paramtypes", [sprints_service_1.SprintsService])
], SprintsController);
//# sourceMappingURL=sprints.controller.js.map