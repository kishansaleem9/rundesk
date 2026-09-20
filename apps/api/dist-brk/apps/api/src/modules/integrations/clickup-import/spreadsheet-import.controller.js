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
exports.SpreadsheetImportController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const spreadsheet_import_service_1 = require("./spreadsheet-import.service");
const jwt_auth_guard_1 = require("../../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../../auth/guards/workspace-admin.guard");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
/**
 * §V2-S13 frame `12:08` — Create › Imports ›.
 *
 * The generic spreadsheet importer. `GET sources` is the single catalogue the
 * picker draws from, including the four rows of the frame this build does NOT
 * cover and the reason for each, so the UI cannot invent a tile the server
 * cannot serve.
 */
let SpreadsheetImportController = class SpreadsheetImportController {
    constructor(svc) {
        this.svc = svc;
    }
    sources() {
        return this.svc.sources();
    }
    preview(workspaceId, body) {
        return this.svc.previewSheet(workspaceId, {
            content: body.content ?? '',
            delimiter: body.delimiter,
            preset: body.preset,
            mapping: body.mapping,
            defaultListName: body.defaultListName,
        });
    }
    run(workspaceId, user, body) {
        return this.svc.startSheetImport(workspaceId, user.id, body);
    }
    jobs(workspaceId, source, limit) {
        return this.svc.listJobs(workspaceId, {
            // Default to this importer's own runs; `source=all` opts out of the filter.
            source: source === 'all' ? undefined : (source ?? spreadsheet_import_service_1.SHEET_SOURCE),
            limit: limit ? Number(limit) : undefined,
        });
    }
    job(workspaceId, jobId) {
        return this.svc.getJob(workspaceId, jobId);
    }
};
exports.SpreadsheetImportController = SpreadsheetImportController;
__decorate([
    (0, common_1.Get)('sources'),
    (0, swagger_1.ApiOperation)({ summary: 'The column presets, the sources with no preset and why, and the accepted file types' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SpreadsheetImportController.prototype, "sources", null);
__decorate([
    (0, common_1.Post)('preview'),
    (0, swagger_1.ApiOperation)({ summary: 'Parse without writing — headers, delimiter, suggested mapping, sample, and the rows that would be REJECTED' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SpreadsheetImportController.prototype, "preview", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(workspace_admin_guard_1.WorkspaceAdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Start a spreadsheet import (admin only) — returns a job id to poll' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], SpreadsheetImportController.prototype, "run", null);
__decorate([
    (0, common_1.Get)('jobs'),
    (0, swagger_1.ApiOperation)({ summary: 'Import history. `source` filters on the job row — spreadsheet runs, not ClickUp ones.' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Query)('source')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], SpreadsheetImportController.prototype, "jobs", null);
__decorate([
    (0, common_1.Get)('jobs/:jobId'),
    (0, swagger_1.ApiOperation)({ summary: 'Poll one import job — progress, per-outcome counts, rejected rows and why' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('jobId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], SpreadsheetImportController.prototype, "job", null);
exports.SpreadsheetImportController = SpreadsheetImportController = __decorate([
    (0, swagger_1.ApiTags)('integrations:spreadsheet-import'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    (0, common_1.Controller)('workspaces/:workspaceId/import/spreadsheet'),
    __metadata("design:paramtypes", [spreadsheet_import_service_1.SpreadsheetImportService])
], SpreadsheetImportController);
//# sourceMappingURL=spreadsheet-import.controller.js.map