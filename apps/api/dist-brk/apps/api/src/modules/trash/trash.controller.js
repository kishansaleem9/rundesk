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
exports.TrashController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const trash_service_1 = require("./trash.service");
/**
 * §13.4 Workspace Trash — one place to see everything that was deleted
 * (spaces, folders, projects, lists, tasks, docs) and either restore it or
 * remove it for good. Membership is enforced by the guard; the service further
 * narrows a non-admin to the items they deleted themselves.
 */
let TrashController = class TrashController {
    constructor(trash) {
        this.trash = trash;
    }
    /** Comma-separated query lists ("task,folder") → validated array. */
    parseTypes(raw) {
        if (!raw)
            return undefined;
        const parsed = raw.split(',').map((s) => s.trim()).filter(Boolean)
            .filter((s) => trash_service_1.TRASH_TYPES.includes(s));
        return parsed.length ? parsed : undefined;
    }
    async list(workspaceId, user, types, deletedBy, search) {
        const items = await this.trash.list(workspaceId, user, {
            types: this.parseTypes(types),
            deletedByIds: deletedBy ? deletedBy.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
            search,
        });
        return { items, retentionDays: trash_service_1.TRASH_RETENTION_DAYS, types: trash_service_1.TRASH_TYPES };
    }
    async deleters(workspaceId, user) {
        return this.trash.deleters(workspaceId, user);
    }
    async restore(workspaceId, type, id, user, ip) {
        return this.trash.restore(workspaceId, type, id, user, ip);
    }
    async deleteForever(workspaceId, type, id, user, ip) {
        return this.trash.deleteForever(workspaceId, type, id, user, ip);
    }
    async clearAll(workspaceId, user, ip) {
        return this.trash.clearAll(workspaceId, user, ip);
    }
};
exports.TrashController = TrashController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List everything in this workspace’s trash' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('types')),
    __param(3, (0, common_1.Query)('deletedBy')),
    __param(4, (0, common_1.Query)('search')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String, String]),
    __metadata("design:returntype", Promise)
], TrashController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('deleters'),
    (0, swagger_1.ApiOperation)({ summary: 'Distinct people who deleted something (for the "Deleted by" filter)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TrashController.prototype, "deleters", null);
__decorate([
    (0, common_1.Post)(':type/:id/restore'),
    (0, swagger_1.ApiOperation)({ summary: 'Restore a trashed item (and any archived ancestors)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('type')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __param(4, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object, String]),
    __metadata("design:returntype", Promise)
], TrashController.prototype, "restore", null);
__decorate([
    (0, common_1.Delete)(':type/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a trashed item forever' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('type')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __param(4, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object, String]),
    __metadata("design:returntype", Promise)
], TrashController.prototype, "deleteForever", null);
__decorate([
    (0, common_1.Delete)(),
    (0, swagger_1.ApiOperation)({ summary: 'Empty the trash (workspace admin/manager only)' }),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Ip)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], TrashController.prototype, "clearAll", null);
exports.TrashController = TrashController = __decorate([
    (0, swagger_1.ApiTags)('trash'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, workspace_member_guard_1.WorkspaceMemberGuard),
    (0, common_1.Controller)('workspaces/:workspaceId/trash'),
    __metadata("design:paramtypes", [trash_service_1.TrashService])
], TrashController);
//# sourceMappingURL=trash.controller.js.map