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
exports.DocsController = exports.DocsPublicController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const feature_flag_guard_1 = require("../../common/guards/feature-flag.guard");
const feature_flag_decorator_1 = require("../../common/decorators/feature-flag.decorator");
const feature_flags_1 = require("@rundesk/feature-flags");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const docs_service_1 = require("./docs.service");
/**
 * Anonymous public-share endpoint. Lives at the root path so the slug is
 * stable and shareable as a clean URL. No auth guard so /d/<slug> works
 * for any visitor with the link.
 */
let DocsPublicController = class DocsPublicController {
    constructor(docs) {
        this.docs = docs;
    }
    getPublic(slug) {
        return this.docs.getByPublicShare(slug);
    }
};
exports.DocsPublicController = DocsPublicController;
__decorate([
    (0, common_1.Get)('public/docs/:slug'),
    __param(0, (0, common_1.Param)('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DocsPublicController.prototype, "getPublic", null);
exports.DocsPublicController = DocsPublicController = __decorate([
    (0, swagger_1.ApiTags)('docs'),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [docs_service_1.DocsService])
], DocsPublicController);
let DocsController = class DocsController {
    constructor(docs) {
        this.docs = docs;
    }
    list(workspaceId, user, spaceId, parentDocId, scope) {
        return this.docs.list(workspaceId, {
            spaceId: spaceId === 'null' ? null : spaceId,
            parentDocId: parentDocId === 'null' ? null : parentDocId,
            scope: docs_service_1.DOC_SCOPES.includes(scope ?? '') ? scope : 'all',
            userId: user.id,
        });
    }
    // Bucket totals for the docs hub rail (A5.6).
    scopeCounts(workspaceId, user) {
        return this.docs.scopeCounts(workspaceId, user.id);
    }
    create(workspaceId, user, body) {
        return this.docs.create({
            workspaceId,
            spaceId: body.spaceId,
            parentDocId: body.parentDocId,
            title: body.title,
            icon: body.icon,
            createdById: user.id,
        });
    }
    // ─── Doc templates ─────────────────────────────────────────────────────────
    listTemplates(workspaceId) {
        return this.docs.listDocTemplates(workspaceId);
    }
    saveTemplate(workspaceId, user, body) {
        return this.docs.saveDocAsTemplate(workspaceId, user.id, body);
    }
    createFromTemplate(workspaceId, templateId, user, body) {
        return this.docs.createDocFromTemplate(workspaceId, user.id, templateId, body);
    }
    deleteTemplate(workspaceId, templateId) {
        return this.docs.deleteDocTemplate(workspaceId, templateId);
    }
    get(docId, user) {
        return this.docs.getForUser(docId, user.id);
    }
    /**
     * §V2-10 — the other end of a task↔doc link.
     *
     * `[06:15]` "acha, is document ka yeh task hai". The task side has existed
     * since relationships shipped; the doc side was never read, so linking from a
     * task and then opening the doc showed no sign of it.
     */
    linkedTasks(docId, user) {
        return this.docs.listLinkedTasks(docId, user.id, user.role);
    }
    async exportDoc(docId, user, res, format) {
        if (format === 'pdf') {
            const { fileName, pdf } = await this.docs.exportDocPdf(docId, user.id);
            res.header('Content-Type', 'application/pdf');
            res.header('Content-Disposition', `attachment; filename="${fileName}"`);
            res.send(pdf);
            return;
        }
        const { fileName, markdown } = await this.docs.exportDocMarkdown(docId, user.id);
        res.header('Content-Type', 'text/markdown; charset=utf-8');
        res.header('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(markdown);
    }
    update(docId, user, body) {
        return this.docs.update(docId, user.id, body);
    }
    remove(docId, user) {
        return this.docs.deleteForUser(docId, user.id);
    }
    // ─── Public share ──────────────────────────────────────────────────────────
    enableShare(docId, user) {
        return this.docs.enablePublicShare(docId, user.id);
    }
    disableShare(docId, user) {
        return this.docs.disablePublicShare(docId, user.id);
    }
    // ─── Version history ───────────────────────────────────────────────────────
    listRevisions(docId, user) {
        return this.docs.listRevisions(docId, user.id);
    }
    getRevision(docId, revisionId, user) {
        return this.docs.getRevision(docId, revisionId, user.id);
    }
    restoreRevision(docId, revisionId, user) {
        return this.docs.restoreRevision(docId, revisionId, user.id);
    }
    // ─── Comments ──────────────────────────────────────────────────────────────
    listComments(docId, user, includeResolved) {
        return this.docs.listComments(docId, user.id, {
            includeResolved: includeResolved !== 'false',
        });
    }
    createComment(docId, user, body) {
        return this.docs.createComment(docId, user.id, body);
    }
    updateComment(commentId, user, body) {
        return this.docs.updateComment(commentId, user.id, body);
    }
    resolveComment(commentId, user, body) {
        return this.docs.setCommentResolution(commentId, user.id, body.resolved !== false);
    }
    removeComment(commentId, user) {
        return this.docs.deleteComment(commentId, user.id);
    }
};
exports.DocsController = DocsController;
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/docs'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('spaceId')),
    __param(3, (0, common_1.Query)('parentDocId')),
    __param(4, (0, common_1.Query)('scope')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String, String]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/docs/scope-counts'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "scopeCounts", null);
__decorate([
    (0, common_1.Post)('workspaces/:workspaceId/docs'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/doc-templates'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "listTemplates", null);
__decorate([
    (0, common_1.Post)('workspaces/:workspaceId/doc-templates'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "saveTemplate", null);
__decorate([
    (0, common_1.Post)('workspaces/:workspaceId/doc-templates/:templateId/create-doc'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('templateId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "createFromTemplate", null);
__decorate([
    (0, common_1.Delete)('workspaces/:workspaceId/doc-templates/:templateId'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('templateId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "deleteTemplate", null);
__decorate([
    (0, common_1.Get)('docs/:docId'),
    __param(0, (0, common_1.Param)('docId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "get", null);
__decorate([
    (0, common_1.Get)('docs/:docId/tasks'),
    __param(0, (0, common_1.Param)('docId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "linkedTasks", null);
__decorate([
    (0, common_1.Get)('docs/:docId/export'),
    __param(0, (0, common_1.Param)('docId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Res)()),
    __param(3, (0, common_1.Query)('format')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, String]),
    __metadata("design:returntype", Promise)
], DocsController.prototype, "exportDoc", null);
__decorate([
    (0, common_1.Patch)('docs/:docId'),
    __param(0, (0, common_1.Param)('docId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)('docs/:docId'),
    __param(0, (0, common_1.Param)('docId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)('docs/:docId/share'),
    __param(0, (0, common_1.Param)('docId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "enableShare", null);
__decorate([
    (0, common_1.Delete)('docs/:docId/share'),
    __param(0, (0, common_1.Param)('docId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "disableShare", null);
__decorate([
    (0, common_1.Get)('docs/:docId/revisions'),
    __param(0, (0, common_1.Param)('docId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "listRevisions", null);
__decorate([
    (0, common_1.Get)('docs/:docId/revisions/:revisionId'),
    __param(0, (0, common_1.Param)('docId')),
    __param(1, (0, common_1.Param)('revisionId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "getRevision", null);
__decorate([
    (0, common_1.Post)('docs/:docId/revisions/:revisionId/restore'),
    __param(0, (0, common_1.Param)('docId')),
    __param(1, (0, common_1.Param)('revisionId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "restoreRevision", null);
__decorate([
    (0, common_1.Get)('docs/:docId/comments'),
    __param(0, (0, common_1.Param)('docId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('includeResolved')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "listComments", null);
__decorate([
    (0, common_1.Post)('docs/:docId/comments'),
    __param(0, (0, common_1.Param)('docId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "createComment", null);
__decorate([
    (0, common_1.Patch)('docs/comments/:commentId'),
    __param(0, (0, common_1.Param)('commentId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "updateComment", null);
__decorate([
    (0, common_1.Post)('docs/comments/:commentId/resolve'),
    __param(0, (0, common_1.Param)('commentId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "resolveComment", null);
__decorate([
    (0, common_1.Delete)('docs/comments/:commentId'),
    __param(0, (0, common_1.Param)('commentId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "removeComment", null);
exports.DocsController = DocsController = __decorate([
    (0, swagger_1.ApiTags)('docs'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)()
    // Backend feature-flag enforcement for Docs (DOCS is default-enabled → no change
    // for existing workspaces; disabling it 404s the authed docs API). The public
    // share controller above is intentionally NOT gated. FeatureFlagGuard runs after
    // JwtAuthGuard so the user/workspace context is available.
    ,
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, feature_flag_guard_1.FeatureFlagGuard),
    (0, feature_flag_decorator_1.FeatureFlag)(feature_flags_1.FLAGS.DOCS),
    __metadata("design:paramtypes", [docs_service_1.DocsService])
], DocsController);
//# sourceMappingURL=docs.controller.js.map