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
exports.TimeEntriesController = exports.TaskTimeEntriesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const not_guest_guard_1 = require("../../common/guards/not-guest.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const tasks_service_1 = require("./tasks.service");
let TaskTimeEntriesController = class TaskTimeEntriesController {
    constructor(tasks) {
        this.tasks = tasks;
    }
    list(taskId) {
        return this.tasks.listTimeEntries(taskId);
    }
    // §3.3 — time tracking is a member capability; guests may read entries but
    // must not start/stop timers or log manual time. NotGuestGuard layers on top
    // of the class-level JwtAuthGuard + ResourceMemberGuard for the mutations only.
    start(taskId, user, body) {
        return this.tasks.startTimer(taskId, user.id, body?.description, body?.isBillable);
    }
    stop(entryId, user) {
        return this.tasks.stopTimer(entryId, user.id);
    }
    manual(taskId, user, body) {
        const startedAt = new Date(body?.startedAt);
        const endedAt = new Date(body?.endedAt);
        if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
            throw new common_1.BadRequestException('startedAt and endedAt must be valid ISO dates');
        }
        if (endedAt.getTime() < startedAt.getTime()) {
            throw new common_1.BadRequestException('endedAt must be after startedAt');
        }
        return this.tasks.addManualTimeEntry({
            taskId,
            userId: user.id,
            startedAt,
            endedAt,
            description: body.description,
            isBillable: body.isBillable,
        });
    }
};
exports.TaskTimeEntriesController = TaskTimeEntriesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TaskTimeEntriesController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('start'),
    (0, common_1.UseGuards)(not_guest_guard_1.NotGuestGuard),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], TaskTimeEntriesController.prototype, "start", null);
__decorate([
    (0, common_1.Post)('stop/:entryId'),
    (0, common_1.UseGuards)(not_guest_guard_1.NotGuestGuard),
    __param(0, (0, common_1.Param)('entryId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], TaskTimeEntriesController.prototype, "stop", null);
__decorate([
    (0, common_1.Post)('manual'),
    (0, common_1.UseGuards)(not_guest_guard_1.NotGuestGuard),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], TaskTimeEntriesController.prototype, "manual", null);
exports.TaskTimeEntriesController = TaskTimeEntriesController = __decorate([
    (0, swagger_1.ApiTags)('tasks'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('tasks/:taskId/time-entries'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, resource_member_guard_1.ResourceMemberGuard),
    __metadata("design:paramtypes", [tasks_service_1.TasksService])
], TaskTimeEntriesController);
let TimeEntriesController = class TimeEntriesController {
    constructor(tasks) {
        this.tasks = tasks;
    }
    active(user) {
        return this.tasks.getActiveTimer(user.id);
    }
};
exports.TimeEntriesController = TimeEntriesController;
__decorate([
    (0, common_1.Get)('active'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TimeEntriesController.prototype, "active", null);
exports.TimeEntriesController = TimeEntriesController = __decorate([
    (0, swagger_1.ApiTags)('tasks'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('time-entries'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [tasks_service_1.TasksService])
], TimeEntriesController);
//# sourceMappingURL=time-entries.controller.js.map