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
exports.TaskTypesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const task_types_service_1 = require("./task-types.service");
/**
 * Task Types. Membership and admin rights are checked inside the service for
 * every route — the collection hangs off a workspace but is applied from a
 * task, so no single guard covers both shapes.
 */
let TaskTypesController = class TaskTypesController {
    constructor(types) {
        this.types = types;
    }
    list(workspaceId, user) {
        return this.types.list(workspaceId, user.id);
    }
    create(workspaceId, user, body) {
        return this.types.create(workspaceId, user.id, body);
    }
    update(workspaceId, typeId, user, body) {
        return this.types.update(workspaceId, typeId, user.id, body);
    }
    remove(workspaceId, typeId, user) {
        return this.types.remove(workspaceId, typeId, user.id);
    }
    setForTask(taskId, user, body) {
        return this.types.setForTask(taskId, body?.taskTypeId ?? null, user.id);
    }
};
exports.TaskTypesController = TaskTypesController;
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/task-types'),
    (0, swagger_1.ApiOperation)({ summary: 'Task types defined in a workspace' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], TaskTypesController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('workspaces/:workspaceId/task-types'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a task type' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], TaskTypesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)('workspaces/:workspaceId/task-types/:typeId'),
    (0, swagger_1.ApiOperation)({ summary: 'Rename or restyle a task type' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('typeId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], TaskTypesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)('workspaces/:workspaceId/task-types/:typeId'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a task type (tasks using it become untyped)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('typeId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], TaskTypesController.prototype, "remove", null);
__decorate([
    (0, common_1.Patch)('tasks/:taskId/task-type'),
    (0, swagger_1.ApiOperation)({ summary: 'Set or clear the type of a task' }),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], TaskTypesController.prototype, "setForTask", null);
exports.TaskTypesController = TaskTypesController = __decorate([
    (0, swagger_1.ApiTags)('tasks'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [task_types_service_1.TaskTypesService])
], TaskTypesController);
//# sourceMappingURL=task-types.controller.js.map