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
exports.PublicFormsController = exports.WorkspaceFormsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const forms_service_1 = require("./forms.service");
const form_dto_1 = require("./dto/form.dto");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const feature_flag_guard_1 = require("../../common/guards/feature-flag.guard");
const feature_flag_decorator_1 = require("../../common/decorators/feature-flag.decorator");
const feature_flags_1 = require("@rundesk/feature-flags");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const rate_limit_guard_1 = require("../../common/guards/rate-limit.guard");
// ─── Workspace-scoped routes (JWT-protected) ──────────────────────────────────
// FeatureFlagGuard enforces the Forms ClickApp: if a workspace turns Forms off
// in Settings → Features, these routes 404. FORMS is default-enabled, so
// existing workspaces are unaffected. (The public submission controller below
// stays open so already-shared forms keep working.)
let WorkspaceFormsController = class WorkspaceFormsController {
    constructor(formsService) {
        this.formsService = formsService;
    }
    list(workspaceId, archived, listId) {
        return this.formsService.listForms(workspaceId, archived === 'true', listId);
    }
    create(workspaceId, user, body) {
        return this.formsService.createForm(workspaceId, user.id, body);
    }
    getOne(formId) {
        return this.formsService.getForm(formId);
    }
    update(formId, body) {
        return this.formsService.updateForm(formId, body);
    }
    duplicate(formId, user) {
        return this.formsService.duplicateForm(formId, user.id);
    }
    archive(formId) {
        return this.formsService.archiveForm(formId);
    }
    delete(formId) {
        return this.formsService.deleteForm(formId);
    }
    // ─── Fields ──────────────────────────────────────────────────────────────
    addField(formId, body) {
        return this.formsService.addField(formId, body);
    }
    updateField(fieldId, body) {
        return this.formsService.updateField(fieldId, body);
    }
    deleteField(fieldId) {
        return this.formsService.deleteField(fieldId);
    }
    reorderFields(formId, body) {
        return this.formsService.reorderFields(formId, body.orderedIds);
    }
    // ─── Submissions ──────────────────────────────────────────────────────────
    listSubmissions(formId) {
        return this.formsService.listSubmissions(formId);
    }
    submissionFile(formId, submissionId, fieldId, user) {
        return this.formsService.getSubmissionFileUrl(formId, submissionId, fieldId, user.id);
    }
    retrySubmissionRouting(formId, submissionId) {
        return this.formsService.retrySubmissionRouting(formId, submissionId);
    }
    clearSubmissionRetryHistory(formId, submissionId) {
        return this.formsService.clearSubmissionRetryHistory(formId, submissionId);
    }
};
exports.WorkspaceFormsController = WorkspaceFormsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List all forms in a workspace' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Query)('archived')),
    __param(2, (0, common_1.Query)('listId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], WorkspaceFormsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new form' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, form_dto_1.CreateFormDto]),
    __metadata("design:returntype", void 0)
], WorkspaceFormsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':formId'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a form with its fields' }),
    __param(0, (0, common_1.Param)('formId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WorkspaceFormsController.prototype, "getOne", null);
__decorate([
    (0, common_1.Patch)(':formId'),
    (0, swagger_1.ApiOperation)({ summary: 'Update form settings' }),
    __param(0, (0, common_1.Param)('formId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorkspaceFormsController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':formId/duplicate'),
    (0, swagger_1.ApiOperation)({ summary: 'Duplicate a form' }),
    __param(0, (0, common_1.Param)('formId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorkspaceFormsController.prototype, "duplicate", null);
__decorate([
    (0, common_1.Patch)(':formId/archive'),
    (0, swagger_1.ApiOperation)({ summary: 'Archive a form' }),
    __param(0, (0, common_1.Param)('formId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WorkspaceFormsController.prototype, "archive", null);
__decorate([
    (0, common_1.Delete)(':formId'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a form permanently' }),
    __param(0, (0, common_1.Param)('formId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WorkspaceFormsController.prototype, "delete", null);
__decorate([
    (0, common_1.Post)(':formId/fields'),
    __param(0, (0, common_1.Param)('formId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, form_dto_1.AddFormFieldDto]),
    __metadata("design:returntype", void 0)
], WorkspaceFormsController.prototype, "addField", null);
__decorate([
    (0, common_1.Patch)(':formId/fields/:fieldId'),
    __param(0, (0, common_1.Param)('fieldId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorkspaceFormsController.prototype, "updateField", null);
__decorate([
    (0, common_1.Delete)(':formId/fields/:fieldId'),
    __param(0, (0, common_1.Param)('fieldId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WorkspaceFormsController.prototype, "deleteField", null);
__decorate([
    (0, common_1.Put)(':formId/fields/reorder'),
    __param(0, (0, common_1.Param)('formId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], WorkspaceFormsController.prototype, "reorderFields", null);
__decorate([
    (0, common_1.Get)(':formId/submissions'),
    __param(0, (0, common_1.Param)('formId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], WorkspaceFormsController.prototype, "listSubmissions", null);
__decorate([
    (0, common_1.Get)(':formId/submissions/:submissionId/files/:fieldId'),
    (0, swagger_1.ApiOperation)({ summary: 'Signed download URL for a file a submitter uploaded' }),
    __param(0, (0, common_1.Param)('formId')),
    __param(1, (0, common_1.Param)('submissionId')),
    __param(2, (0, common_1.Param)('fieldId')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", void 0)
], WorkspaceFormsController.prototype, "submissionFile", null);
__decorate([
    (0, common_1.Post)(':formId/submissions/:submissionId/retry-routing'),
    __param(0, (0, common_1.Param)('formId')),
    __param(1, (0, common_1.Param)('submissionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], WorkspaceFormsController.prototype, "retrySubmissionRouting", null);
__decorate([
    (0, common_1.Delete)(':formId/submissions/:submissionId/retry-history'),
    __param(0, (0, common_1.Param)('formId')),
    __param(1, (0, common_1.Param)('submissionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], WorkspaceFormsController.prototype, "clearSubmissionRetryHistory", null);
exports.WorkspaceFormsController = WorkspaceFormsController = __decorate([
    (0, swagger_1.ApiTags)('forms'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard, feature_flag_guard_1.FeatureFlagGuard),
    (0, feature_flag_decorator_1.FeatureFlag)(feature_flags_1.FLAGS.FORMS),
    (0, common_1.Controller)('workspaces/:workspaceId/forms'),
    __metadata("design:paramtypes", [forms_service_1.FormsService])
], WorkspaceFormsController);
// ─── Public routes (no JWT) ───────────────────────────────────────────────────
// A5.5 — these are the only unauthenticated write paths into a task list, so
// they carry per-IP rate limits. `isPublic = false` already refuses anonymous
// access entirely (FormsService.getFormBySlug); the limits below bound abuse of
// the forms that are deliberately open.
let PublicFormsController = class PublicFormsController {
    constructor(formsService) {
        this.formsService = formsService;
    }
    getBySlug(slug) {
        return this.formsService.getFormBySlug(slug);
    }
    submit(slug, body) {
        return this.formsService.submitForm(slug, body.data ?? {}, body.submitterEmail, body.submitterName, body.hp);
    }
    presignUpload(slug, body) {
        return this.formsService.createUploadUrl(slug, body);
    }
};
exports.PublicFormsController = PublicFormsController;
__decorate([
    (0, common_1.Get)(':slug'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a public form by slug (no auth required)' }),
    (0, rate_limit_guard_1.RateLimit)({ limit: 120, windowMs: 60_000 }),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PublicFormsController.prototype, "getBySlug", null);
__decorate([
    (0, common_1.Post)(':slug/submit'),
    (0, swagger_1.ApiOperation)({ summary: 'Submit a form response (no auth required)' }),
    (0, rate_limit_guard_1.RateLimit)({ limit: 10, windowMs: 60_000 }),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, form_dto_1.SubmitFormDto]),
    __metadata("design:returntype", void 0)
], PublicFormsController.prototype, "submit", null);
__decorate([
    (0, common_1.Post)(':slug/attachments/presign'),
    (0, swagger_1.ApiOperation)({ summary: 'Presign a file upload for a public form field (no auth required)' }),
    (0, rate_limit_guard_1.RateLimit)({ limit: 20, windowMs: 60_000 }),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PublicFormsController.prototype, "presignUpload", null);
exports.PublicFormsController = PublicFormsController = __decorate([
    (0, swagger_1.ApiTags)('forms-public'),
    (0, common_1.UseGuards)(rate_limit_guard_1.RateLimitGuard),
    (0, common_1.Controller)('forms'),
    __metadata("design:paramtypes", [forms_service_1.FormsService])
], PublicFormsController);
//# sourceMappingURL=forms.controller.js.map