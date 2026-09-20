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
exports.ClickUpImportController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const clickup_import_service_1 = require("./clickup-import.service");
const jwt_auth_guard_1 = require("../../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../../auth/guards/workspace-admin.guard");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
let ClickUpImportController = class ClickUpImportController {
    constructor(svc) {
        this.svc = svc;
    }
    preview(workspaceId, body) {
        return this.svc.preview(workspaceId, { csv: body.csv ?? '', targetSpaceId: body.targetSpaceId });
    }
    run(workspaceId, user, body) {
        return this.svc.startImport(workspaceId, user.id, body);
    }
    job(workspaceId, jobId) {
        return this.svc.getJob(workspaceId, jobId);
    }
    enrich(workspaceId, jobId, user, body) {
        return this.svc.enrichJob(workspaceId, jobId, user.id, {
            apiToken: body.apiToken,
            mapping: body.mapping ?? [],
        });
    }
};
exports.ClickUpImportController = ClickUpImportController;
__decorate([
    (0, common_1.Post)('preview'),
    (0, swagger_1.ApiOperation)({ summary: 'Preview a ClickUp CSV — rows, lists, custom fields, duplicates' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ClickUpImportController.prototype, "preview", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({
        summary: 'Start a ClickUp CSV import (admin only) — returns a job id to poll. Supply apiToken to ALSO import comments + attachments via the ClickUp API.',
    }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ClickUpImportController.prototype, "run", null);
__decorate([
    (0, common_1.Get)('jobs/:jobId'),
    (0, swagger_1.ApiOperation)({ summary: 'Poll an import job — status, progress counts, and final report' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], ClickUpImportController.prototype, "job", null);
__decorate([
    (0, common_1.Post)('jobs/:jobId/enrich'),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({
        summary: 'Import ClickUp comments + attachments for an already-imported job (admin only). Body: { apiToken, mapping: [{ clickupTaskId, taskId }] }.',
    }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('jobId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], ClickUpImportController.prototype, "enrich", null);
exports.ClickUpImportController = ClickUpImportController = __decorate([
    (0, swagger_1.ApiTags)('integrations:clickup-import'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    (0, common_1.Controller)('workspaces/:workspaceId/import/clickup'),
    __metadata("design:paramtypes", [clickup_import_service_1.ClickUpImportService])
], ClickUpImportController);
//# sourceMappingURL=clickup-import.controller.js.map