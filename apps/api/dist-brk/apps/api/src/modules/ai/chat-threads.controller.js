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
exports.ChatThreadsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const chat_threads_service_1 = require("./chat-threads.service");
/**
 * §15 — the sidebar's "AI Chats" list.
 *
 * Under `workspaces/:workspaceId` with the membership guard, like every other
 * container in this codebase — including the routes addressing one thread by
 * id, so a stranger's id never reaches the service in the first place.
 */
let ChatThreadsController = class ChatThreadsController {
    constructor(svc) {
        this.svc = svc;
    }
    list(workspaceId, user) {
        return this.svc.list(workspaceId, user.id);
    }
    create(workspaceId, user, body) {
        return this.svc.create(workspaceId, user.id, body?.skillId);
    }
    get(workspaceId, threadId, user) {
        return this.svc.get(workspaceId, user.id, threadId);
    }
    append(workspaceId, threadId, user, body) {
        return this.svc.append(workspaceId, user.id, threadId, body);
    }
    // ─── The six-icon row under an assistant answer ───────────────────────────
    createTaskFrom(workspaceId, threadId, messageId, user) {
        return this.svc.createTaskFrom(workspaceId, user.id, threadId, messageId);
    }
    saveToDoc(workspaceId, threadId, messageId, user) {
        return this.svc.saveToDoc(workspaceId, user.id, threadId, messageId);
    }
    setFeedback(workspaceId, threadId, messageId, user, body) {
        const value = body?.feedback;
        return this.svc.setFeedback(workspaceId, user.id, threadId, messageId, value === 'up' || value === 'down' ? value : null);
    }
    rename(workspaceId, threadId, user, body) {
        return this.svc.rename(workspaceId, user.id, threadId, body?.title ?? '');
    }
    remove(workspaceId, threadId, user) {
        return this.svc.remove(workspaceId, user.id, threadId);
    }
};
exports.ChatThreadsController = ChatThreadsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Your AI chats, newest first' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChatThreadsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatThreadsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':threadId'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('threadId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], ChatThreadsController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(':threadId/messages'),
    (0, swagger_1.ApiOperation)({ summary: 'Append a turn; may return the thread’s new automatic title' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('threadId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatThreadsController.prototype, "append", null);
__decorate([
    (0, common_1.Post)(':threadId/messages/:messageId/task'),
    (0, swagger_1.ApiOperation)({ summary: '§15 — "create task from this" (frame 302_1842)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('threadId')),
    __param(2, (0, common_1.Param)('messageId')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", void 0)
], ChatThreadsController.prototype, "createTaskFrom", null);
__decorate([
    (0, common_1.Post)(':threadId/messages/:messageId/doc'),
    (0, swagger_1.ApiOperation)({ summary: '§15 — "save to doc"' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('threadId')),
    __param(2, (0, common_1.Param)('messageId')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", void 0)
], ChatThreadsController.prototype, "saveToDoc", null);
__decorate([
    (0, common_1.Patch)(':threadId/messages/:messageId/feedback'),
    (0, swagger_1.ApiOperation)({ summary: '§15 — thumbs up / down; pressing the same one again clears it' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('threadId')),
    __param(2, (0, common_1.Param)('messageId')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __param(4, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatThreadsController.prototype, "setFeedback", null);
__decorate([
    (0, common_1.Patch)(':threadId'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('threadId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], ChatThreadsController.prototype, "rename", null);
__decorate([
    (0, common_1.Delete)(':threadId'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('threadId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], ChatThreadsController.prototype, "remove", null);
exports.ChatThreadsController = ChatThreadsController = __decorate([
    (0, swagger_1.ApiTags)('ai-chats'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('workspaces/:workspaceId/ai-chats'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    __metadata("design:paramtypes", [chat_threads_service_1.ChatThreadsService])
], ChatThreadsController);
//# sourceMappingURL=chat-threads.controller.js.map