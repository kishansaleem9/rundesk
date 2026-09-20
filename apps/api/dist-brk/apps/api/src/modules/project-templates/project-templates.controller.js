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
exports.ProjectTemplatesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const project_templates_service_1 = require("./project-templates.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
let ProjectTemplatesController = class ProjectTemplatesController {
    constructor(svc) {
        this.svc = svc;
    }
    list(workspaceId) {
        return this.svc.list(workspaceId);
    }
    /**
     * §V2-13 / frame `12:14` — the Template Center's faceted browse.
     *
     * A separate route rather than query params bolted onto `GET /`, because the
     * shape is different: `{ templates, total, facets }` instead of an array.
     * `GET /` keeps its contract for everything that already reads it.
     *
     * Declared BEFORE `:templateId`, or Nest matches "browse" as a template id
     * and this route is never reached.
     */
    browse(workspaceId, q, scope, type, complexity, category, useCase) {
        return this.svc.browse(workspaceId, { q, scope, type, complexity, category, useCase });
    }
    getOne(workspaceId, templateId) {
        return this.svc.getOne(workspaceId, templateId);
    }
    saveFromProject(workspaceId, user, body) {
        return this.svc.saveFromProject(workspaceId, user.id, body);
    }
    create(workspaceId, user, body) {
        return this.svc.create(workspaceId, user.id, body);
    }
    apply(workspaceId, user, body) {
        return this.svc.apply(workspaceId, user.id, body);
    }
    remove(workspaceId, templateId) {
        return this.svc.delete(workspaceId, templateId);
    }
};
exports.ProjectTemplatesController = ProjectTemplatesController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List built-in + workspace templates' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ProjectTemplatesController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('browse'),
    (0, swagger_1.ApiOperation)({ summary: 'Browse templates with server-computed facet counts' }),
    (0, swagger_1.ApiQuery)({ name: 'q', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'scope', required: false, enum: ['all', 'builtin', 'custom'] }),
    (0, swagger_1.ApiQuery)({ name: 'type', required: false, description: 'CSV of space|folder|list' }),
    (0, swagger_1.ApiQuery)({ name: 'complexity', required: false, description: 'CSV of beginner|intermediate|advanced' }),
    (0, swagger_1.ApiQuery)({ name: 'category', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'useCase', required: false }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Query)('q')),
    __param(2, (0, common_1.Query)('scope')),
    __param(3, (0, common_1.Query)('type')),
    __param(4, (0, common_1.Query)('complexity')),
    __param(5, (0, common_1.Query)('category')),
    __param(6, (0, common_1.Query)('useCase')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String]),
    __metadata("design:returntype", void 0)
], ProjectTemplatesController.prototype, "browse", null);
__decorate([
    (0, common_1.Get)(':templateId'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('templateId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ProjectTemplatesController.prototype, "getOne", null);
__decorate([
    (0, common_1.Post)('save-from-project'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Save an existing project as a reusable template (admin only)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ProjectTemplatesController.prototype, "saveFromProject", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Create a template from an inline payload (admin only)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ProjectTemplatesController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('apply'),
    (0, swagger_1.ApiOperation)({
        summary: 'Apply a template — a space, a project under :targetSpaceId, or one list ' +
            'into :targetProjectId, according to the template’s own targetType',
    }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ProjectTemplatesController.prototype, "apply", null);
__decorate([
    (0, common_1.Delete)(':templateId'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a workspace template (admin only)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('templateId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ProjectTemplatesController.prototype, "remove", null);
exports.ProjectTemplatesController = ProjectTemplatesController = __decorate([
    (0, swagger_1.ApiTags)('project-templates'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    (0, common_1.Controller)('workspaces/:workspaceId/project-templates'),
    __metadata("design:paramtypes", [project_templates_service_1.ProjectTemplatesService])
], ProjectTemplatesController);
//# sourceMappingURL=project-templates.controller.js.map