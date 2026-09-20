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
exports.KnowledgeController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const not_guest_guard_1 = require("../../common/guards/not-guest.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const ai_service_1 = require("./ai.service");
const knowledge_indexer_service_1 = require("./knowledge-indexer.service");
/**
 * §15.1 admin backfill for the semantic Knowledge Base (trigger a). Kept on its
 * own controller so the route matches the spec — POST /workspaces/:id/knowledge/reindex
 * — while living entirely inside the AI module. Manager/admin only; the AI
 * question endpoint stays on AiController.
 */
let KnowledgeController = class KnowledgeController {
    constructor(ai, indexer) {
        this.ai = ai;
        this.indexer = indexer;
    }
    async reindex(user, workspaceId) {
        // Reindexing is a privileged, workspace-wide action — managers/admins only.
        await this.ai.assertWorkspaceManager(workspaceId, user.id);
        return this.indexer.indexWorkspaceContent(workspaceId);
    }
};
exports.KnowledgeController = KnowledgeController;
__decorate([
    (0, common_1.Post)('reindex'),
    (0, swagger_1.ApiOperation)({ summary: 'Re-embed this workspace into the semantic knowledge store (admin/manager)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], KnowledgeController.prototype, "reindex", null);
exports.KnowledgeController = KnowledgeController = __decorate([
    (0, swagger_1.ApiTags)('ai'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, not_guest_guard_1.NotGuestGuard),
    (0, common_1.Controller)('workspaces/:id/knowledge'),
    __metadata("design:paramtypes", [ai_service_1.AiService,
        knowledge_indexer_service_1.KnowledgeIndexerService])
], KnowledgeController);
//# sourceMappingURL=knowledge.controller.js.map