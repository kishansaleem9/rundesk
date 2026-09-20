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
exports.TaskChecklistsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const tasks_service_1 = require("./tasks.service");
let TaskChecklistsController = class TaskChecklistsController {
    constructor(tasks) {
        this.tasks = tasks;
    }
    create(taskId, user, body) {
        return this.tasks.createChecklist(taskId, body.title, user.id);
    }
    update(checklistId, body) {
        return this.tasks.updateChecklist(checklistId, body);
    }
    delete(checklistId) {
        return this.tasks.deleteChecklist(checklistId);
    }
    addItem(checklistId, user, body) {
        return this.tasks.addChecklistItem(checklistId, body.content, body.assigneeId, body.dueDate ? new Date(body.dueDate) : null, user.id);
    }
    updateItem(itemId, user, body) {
        const patch = { ...body };
        if ('dueDate' in body)
            patch.dueDate = body.dueDate ? new Date(body.dueDate) : null;
        return this.tasks.updateChecklistItem(itemId, user.id, patch);
    }
    deleteItem(itemId) {
        return this.tasks.deleteChecklistItem(itemId);
    }
};
exports.TaskChecklistsController = TaskChecklistsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], TaskChecklistsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':checklistId'),
    __param(0, (0, common_1.Param)('checklistId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], TaskChecklistsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':checklistId'),
    __param(0, (0, common_1.Param)('checklistId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TaskChecklistsController.prototype, "delete", null);
__decorate([
    (0, common_1.Post)(':checklistId/items'),
    __param(0, (0, common_1.Param)('checklistId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], TaskChecklistsController.prototype, "addItem", null);
__decorate([
    (0, common_1.Patch)('items/:itemId'),
    __param(0, (0, common_1.Param)('itemId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], TaskChecklistsController.prototype, "updateItem", null);
__decorate([
    (0, common_1.Delete)('items/:itemId'),
    __param(0, (0, common_1.Param)('itemId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TaskChecklistsController.prototype, "deleteItem", null);
exports.TaskChecklistsController = TaskChecklistsController = __decorate([
    (0, swagger_1.ApiTags)('tasks'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('tasks/:taskId/checklists'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, resource_member_guard_1.ResourceMemberGuard),
    __metadata("design:paramtypes", [tasks_service_1.TasksService])
], TaskChecklistsController);
//# sourceMappingURL=checklists.controller.js.map