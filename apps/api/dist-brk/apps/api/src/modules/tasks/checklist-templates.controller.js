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
exports.ChecklistTemplatesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const checklist_templates_service_1 = require("./checklist-templates.service");
/**
 * Reusable checklists. Membership is checked inside the service for every
 * route, since these hang off three different parents (workspace, checklist,
 * task) and there is no single resource id a guard could key on.
 */
let ChecklistTemplatesController = class ChecklistTemplatesController {
    constructor(templates) {
        this.templates = templates;
    }
    list(workspaceId, user) {
        return this.templates.list(workspaceId, user.id);
    }
    create(workspaceId, user, body) {
        return this.templates.create(workspaceId, user.id, body);
    }
    saveAsTemplate(checklistId, user, body) {
        return this.templates.createFromChecklist(checklistId, user.id, body?.name);
    }
    apply(taskId, templateId, user) {
        return this.templates.applyToTask(taskId, templateId, user.id);
    }
    remove(templateId, user) {
        return this.templates.remove(templateId, user.id);
    }
};
exports.ChecklistTemplatesController = ChecklistTemplatesController;
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/checklist-templates'),
    (0, swagger_1.ApiOperation)({ summary: 'Checklist templates available in a workspace' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChecklistTemplatesController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('workspaces/:workspaceId/checklist-templates'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a checklist template' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChecklistTemplatesController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('checklists/:checklistId/save-as-template'),
    (0, swagger_1.ApiOperation)({ summary: 'Save an existing checklist as a reusable template' }),
    __param(0, (0, common_1.Param)('checklistId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChecklistTemplatesController.prototype, "saveAsTemplate", null);
__decorate([
    (0, common_1.Post)('tasks/:taskId/checklists/from-template/:templateId'),
    (0, swagger_1.ApiOperation)({ summary: 'Add a checklist to a task from a template' }),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Param)('templateId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], ChecklistTemplatesController.prototype, "apply", null);
__decorate([
    (0, common_1.Delete)('checklist-templates/:templateId'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a checklist template' }),
    __param(0, (0, common_1.Param)('templateId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChecklistTemplatesController.prototype, "remove", null);
exports.ChecklistTemplatesController = ChecklistTemplatesController = __decorate([
    (0, swagger_1.ApiTags)('tasks'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [checklist_templates_service_1.ChecklistTemplatesService])
], ChecklistTemplatesController);
//# sourceMappingURL=checklist-templates.controller.js.map