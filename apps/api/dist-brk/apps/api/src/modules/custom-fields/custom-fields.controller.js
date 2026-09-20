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
exports.CustomFieldsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const custom_fields_service_1 = require("./custom-fields.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
let CustomFieldsController = class CustomFieldsController {
    constructor(svc) {
        this.svc = svc;
    }
    // ── Definitions (project-scoped) ──────────────────────────────────────────
    list(workspaceId, projectId) {
        return this.svc.listForProject(workspaceId, projectId);
    }
    create(workspaceId, projectId, body) {
        return this.svc.createDefinition(workspaceId, projectId, body);
    }
    update(workspaceId, fieldId, body) {
        return this.svc.updateDefinition(workspaceId, fieldId, body);
    }
    remove(workspaceId, fieldId) {
        return this.svc.deleteDefinition(workspaceId, fieldId);
    }
    // ── Values (task-scoped) ──────────────────────────────────────────────────
    getValues(workspaceId, taskId) {
        return this.svc.getValuesForTask(workspaceId, taskId);
    }
    setValue(user, workspaceId, taskId, fieldId, body) {
        // The actor is passed for `voting` only, which ignores `body.value` and
        // toggles this person's own vote — see the service.
        return this.svc.setValue(workspaceId, taskId, fieldId, body.value, user.id);
    }
};
exports.CustomFieldsController = CustomFieldsController;
__decorate([
    (0, common_1.Get)('projects/:projectId/custom-fields'),
    (0, swagger_1.ApiOperation)({ summary: 'List custom field definitions for a project' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('projectId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], CustomFieldsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('projects/:projectId/custom-fields'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a custom field definition' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('projectId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], CustomFieldsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)('custom-fields/:fieldId'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('fieldId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], CustomFieldsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)('custom-fields/:fieldId'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('fieldId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], CustomFieldsController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)('tasks/:taskId/custom-fields'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all custom field values for a task' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], CustomFieldsController.prototype, "getValues", null);
__decorate([
    (0, common_1.Put)('tasks/:taskId/custom-fields/:fieldId'),
    (0, swagger_1.ApiOperation)({ summary: 'Set a custom field value on a task' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('workspaceId')),
    __param(2, (0, common_1.Param)('taskId')),
    __param(3, (0, common_1.Param)('fieldId')),
    __param(4, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, Object]),
    __metadata("design:returntype", void 0)
], CustomFieldsController.prototype, "setValue", null);
exports.CustomFieldsController = CustomFieldsController = __decorate([
    (0, swagger_1.ApiTags)('custom-fields'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    (0, common_1.Controller)('workspaces/:workspaceId'),
    __metadata("design:paramtypes", [custom_fields_service_1.CustomFieldsService])
], CustomFieldsController);
//# sourceMappingURL=custom-fields.controller.js.map