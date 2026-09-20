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
exports.SavedCommentsController = exports.TaskCommentsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const tasks_service_1 = require("./tasks.service");
const comment_dto_1 = require("./dto/comment.dto");
let TaskCommentsController = class TaskCommentsController {
    constructor(tasks) {
        this.tasks = tasks;
    }
    list(taskId, user) {
        // The viewer is threaded in for §V2-S06's `savedByMe` — a bookmark is per
        // person, so the list cannot be the same for everybody.
        return this.tasks.listComments(taskId, user.id);
    }
    /**
     * §V2-05, frame `04:00` — the @ picker's people, each flagged with whether
     * they can actually open this task.
     *
     * It hangs off the comments controller because that is the guard it needs:
     * `ResourceMemberGuard` resolves `:taskId` and refuses anyone who cannot
     * reach the task themselves, so a person cannot use this to learn the
     * membership of a task they have no business seeing.
     */
    mentionCandidates(taskId) {
        return this.tasks.listMentionCandidates(taskId);
    }
    create(taskId, user, body) {
        return this.tasks.createComment(taskId, user.id, body.body, body.parentCommentId, body.mentions, body.attachmentIds);
    }
    update(commentId, user, body) {
        return this.tasks.updateComment(commentId, user.id, body.body);
    }
    delete(commentId, user) {
        return this.tasks.deleteComment(commentId, user.id);
    }
    toggleReaction(commentId, user, body) {
        return this.tasks.toggleReaction(commentId, user.id, body.emoji);
    }
    assign(commentId, user, body) {
        return this.tasks.assignComment(commentId, user.id, body.userId);
    }
    resolve(commentId, user, body) {
        return this.tasks.resolveComment(commentId, user.id, body.resolved);
    }
    /**
     * §V2-S06 frame `05:55` — save a comment for later. Mirrors chat's
     * `POST /chat/messages/:messageId/save` down to the shape of the response, so
     * the two saves in the product are the same thing twice and not two things.
     */
    save(taskId, commentId, user) {
        return this.tasks.setCommentSaved(taskId, commentId, user.id, true);
    }
    unsave(taskId, commentId, user) {
        return this.tasks.setCommentSaved(taskId, commentId, user.id, false);
    }
};
exports.TaskCommentsController = TaskCommentsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], TaskCommentsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('mention-candidates'),
    __param(0, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], TaskCommentsController.prototype, "mentionCandidates", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, comment_dto_1.CreateCommentDto]),
    __metadata("design:returntype", void 0)
], TaskCommentsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':commentId'),
    __param(0, (0, common_1.Param)('commentId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], TaskCommentsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':commentId'),
    __param(0, (0, common_1.Param)('commentId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], TaskCommentsController.prototype, "delete", null);
__decorate([
    (0, common_1.Post)(':commentId/reactions'),
    __param(0, (0, common_1.Param)('commentId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], TaskCommentsController.prototype, "toggleReaction", null);
__decorate([
    (0, common_1.Post)(':commentId/assign'),
    __param(0, (0, common_1.Param)('commentId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], TaskCommentsController.prototype, "assign", null);
__decorate([
    (0, common_1.Post)(':commentId/resolve'),
    __param(0, (0, common_1.Param)('commentId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], TaskCommentsController.prototype, "resolve", null);
__decorate([
    (0, common_1.Post)(':commentId/save'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Param)('commentId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], TaskCommentsController.prototype, "save", null);
__decorate([
    (0, common_1.Delete)(':commentId/save'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Param)('commentId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], TaskCommentsController.prototype, "unsave", null);
exports.TaskCommentsController = TaskCommentsController = __decorate([
    (0, swagger_1.ApiTags)('tasks'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('tasks/:taskId/comments'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, resource_member_guard_1.ResourceMemberGuard),
    __metadata("design:paramtypes", [tasks_service_1.TasksService])
], TaskCommentsController);
/**
 * The workspace-wide read of §V2-S06's saves, for the Inbox's Later tab.
 *
 * A separate controller because it needs a different guard: `ResourceMemberGuard`
 * above resolves `:taskId`, and this route has no task — it is "everything I
 * saved in this workspace". Membership of the workspace is the gate; the
 * service re-checks per-task visibility on top, because being able to open a
 * workspace is not being able to read every private Space in it.
 */
let SavedCommentsController = class SavedCommentsController {
    constructor(tasks) {
        this.tasks = tasks;
    }
    listSaved(workspaceId, user) {
        return this.tasks.listSavedComments(workspaceId, user.id);
    }
};
exports.SavedCommentsController = SavedCommentsController;
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/comments/saved'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], SavedCommentsController.prototype, "listSaved", null);
exports.SavedCommentsController = SavedCommentsController = __decorate([
    (0, swagger_1.ApiTags)('tasks'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    __metadata("design:paramtypes", [tasks_service_1.TasksService])
], SavedCommentsController);
//# sourceMappingURL=comments.controller.js.map