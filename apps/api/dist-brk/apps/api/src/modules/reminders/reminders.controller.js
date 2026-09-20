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
exports.RemindersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const task_reminders_service_1 = require("./task-reminders.service");
let RemindersController = class RemindersController {
    constructor(reminders) {
        this.reminders = reminders;
    }
    /** The caller's still-pending reminders across the workspace. */
    listUpcoming(workspaceId, user) {
        return this.reminders.listUpcoming(workspaceId, user.id);
    }
    /** The caller's reminders on a specific task. */
    listForTask(taskId, user) {
        return this.reminders.listForTask(taskId, user.id);
    }
    /**
     * A reminder about a task, or about nothing in particular.
     *
     * §G15 [21:36] — "phir REMINDER ka" is one of the things the create modal is
     * supposed to offer, and there is nothing to attach a reminder to at that
     * moment: you are creating it, not annotating something. Since 0115 the
     * subject is optional, so a bare `{ remindAt, note }` is a whole reminder.
     */
    create(workspaceId, user, body) {
        if (body.taskId) {
            return this.reminders.create(workspaceId, user.id, body.taskId, body.remindAt, body.note);
        }
        return this.reminders.createStandalone(workspaceId, user.id, body.remindAt, body.note ?? '');
    }
    remove(id, user) {
        return this.reminders.remove(id, user.id);
    }
};
exports.RemindersController = RemindersController;
__decorate([
    (0, common_1.Get)('reminders'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], RemindersController.prototype, "listUpcoming", null);
__decorate([
    (0, common_1.Get)('tasks/:taskId/reminders'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], RemindersController.prototype, "listForTask", null);
__decorate([
    (0, common_1.Post)('reminders'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], RemindersController.prototype, "create", null);
__decorate([
    (0, common_1.Delete)('reminders/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], RemindersController.prototype, "remove", null);
exports.RemindersController = RemindersController = __decorate([
    (0, swagger_1.ApiTags)('reminders'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('workspaces/:workspaceId'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    __metadata("design:paramtypes", [task_reminders_service_1.TaskRemindersService])
], RemindersController);
//# sourceMappingURL=reminders.controller.js.map