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
exports.TaskExternalLinksController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const tasks_service_1 = require("./tasks.service");
const external_link_dto_1 = require("./dto/external-link.dto");
/**
 * Task ↔ external-service links (Plan §12.8 GitHub/GitLab, §12.2 Google Drive).
 * Access is enforced like other nested task writes (ResourceMemberGuard on the
 * :taskId param + the service's task-write access check).
 */
let TaskExternalLinksController = class TaskExternalLinksController {
    constructor(tasks) {
        this.tasks = tasks;
    }
    list(taskId, user) {
        return this.tasks.listExternalLinks(taskId, user.id);
    }
    /** §12.6 — links attached to a specific comment on this task. */
    listForComment(taskId, commentId, user) {
        return this.tasks.listExternalLinksForComment(taskId, commentId, user.id);
    }
    create(taskId, user, body) {
        return this.tasks.addExternalLink(taskId, user.id, {
            url: body.url,
            provider: body.provider,
            commentId: body.commentId,
        });
    }
    refresh(taskId, linkId, user) {
        return this.tasks.refreshExternalLink(taskId, linkId, user.id);
    }
    remove(taskId, linkId, user) {
        return this.tasks.removeExternalLink(taskId, linkId, user.id);
    }
};
exports.TaskExternalLinksController = TaskExternalLinksController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], TaskExternalLinksController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('comment/:commentId'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Param)('commentId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], TaskExternalLinksController.prototype, "listForComment", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, external_link_dto_1.CreateExternalLinkDto]),
    __metadata("design:returntype", void 0)
], TaskExternalLinksController.prototype, "create", null);
__decorate([
    (0, common_1.Post)(':linkId/refresh'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Param)('linkId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], TaskExternalLinksController.prototype, "refresh", null);
__decorate([
    (0, common_1.Delete)(':linkId'),
    __param(0, (0, common_1.Param)('taskId')),
    __param(1, (0, common_1.Param)('linkId')),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], TaskExternalLinksController.prototype, "remove", null);
exports.TaskExternalLinksController = TaskExternalLinksController = __decorate([
    (0, swagger_1.ApiTags)('tasks'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('tasks/:taskId/links'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, resource_member_guard_1.ResourceMemberGuard),
    __metadata("design:paramtypes", [tasks_service_1.TasksService])
], TaskExternalLinksController);
//# sourceMappingURL=external-links.controller.js.map