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
exports.TaskTemplatesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const permissions_guard_1 = require("../custom-roles/permissions.guard");
const task_templates_service_1 = require("./task-templates.service");
/**
 * Workspace-scoped CRUD for single-task templates plus the convenience
 * endpoints that snapshot from / instantiate to a real task. Members
 * can read and instantiate; create/edit/delete need `template.manage`
 * (or legacy admin role, which already implies it).
 */
let TaskTemplatesController = class TaskTemplatesController {
    constructor(templates) {
        this.templates = templates;
    }
    list(workspaceId) {
        return this.templates.list(workspaceId);
    }
    getOne(workspaceId, id) {
        return this.templates.getById(workspaceId, id);
    }
    create(workspaceId, body, user) {
        return this.templates.create(workspaceId, { id: user.id, email: user.email }, body);
    }
    update(workspaceId, id, body, user) {
        return this.templates.update(workspaceId, id, { id: user.id, email: user.email }, body);
    }
    async remove(workspaceId, id, user) {
        await this.templates.remove(workspaceId, id, { id: user.id, email: user.email });
        return { ok: true };
    }
    saveFromTask(workspaceId, taskId, body, user) {
        return this.templates.saveFromTask(workspaceId, taskId, { id: user.id, email: user.email }, body);
    }
    duplicate(workspaceId, taskId, user) {
        return this.templates.duplicateTask(workspaceId, taskId, { id: user.id, email: user.email });
    }
    instantiate(workspaceId, templateId, body, user) {
        return this.templates.instantiate(workspaceId, templateId, { id: user.id, email: user.email }, body);
    }
};
exports.TaskTemplatesController = TaskTemplatesController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    (0, swagger_1.ApiOperation)({ summary: 'List task templates in this workspace' }),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TaskTemplatesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], TaskTemplatesController.prototype, "getOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard, permissions_guard_1.PermissionsGuard),
    (0, permissions_guard_1.RequirePermissions)('template.manage'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a task template with an inline payload' }),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], TaskTemplatesController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard, permissions_guard_1.PermissionsGuard),
    (0, permissions_guard_1.RequirePermissions)('template.manage'),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], TaskTemplatesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard, permissions_guard_1.PermissionsGuard),
    (0, permissions_guard_1.RequirePermissions)('template.manage'),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TaskTemplatesController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('from-task/:taskId'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard, permissions_guard_1.PermissionsGuard),
    (0, permissions_guard_1.RequirePermissions)('template.manage'),
    (0, swagger_1.ApiOperation)({ summary: 'Snapshot an existing task into a new template' }),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Param)('taskId', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], TaskTemplatesController.prototype, "saveFromTask", null);
__decorate([
    (0, common_1.Post)('duplicate/:taskId'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Duplicate an existing task into the same list' }),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Param)('taskId', new common_1.ParseUUIDPipe())),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], TaskTemplatesController.prototype, "duplicate", null);
__decorate([
    (0, common_1.Post)(':id/instantiate'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Create a real task from a template under a target list' }),
    __param(0, (0, common_1.Param)('workspaceId', new common_1.ParseUUIDPipe())),
    __param(1, (0, common_1.Param)('id', new common_1.ParseUUIDPipe())),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], TaskTemplatesController.prototype, "instantiate", null);
exports.TaskTemplatesController = TaskTemplatesController = __decorate([
    (0, swagger_1.ApiTags)('task-templates'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('workspaces/:workspaceId/task-templates'),
    __metadata("design:paramtypes", [task_templates_service_1.TaskTemplatesService])
], TaskTemplatesController);
//# sourceMappingURL=task-templates.controller.js.map