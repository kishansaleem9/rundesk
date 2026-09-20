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
exports.WorkspaceTimeEntriesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const time_entries_service_1 = require("./time-entries.service");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
let WorkspaceTimeEntriesController = class WorkspaceTimeEntriesController {
    constructor(time) {
        this.time = time;
    }
    async list(workspaceId, actor, userId, since) {
        // Members may only see their own time logs; admins can filter by anyone.
        const canModerate = await this.time.canModerateApprovals(workspaceId, actor.id);
        return this.time.listForWorkspace(workspaceId, {
            userId: canModerate ? userId : actor.id,
            since: since ? new Date(since) : undefined,
            actorId: actor.id,
            actorRole: actor.role,
        });
    }
    // Edit / delete a time log. The service enforces that only the entry's
    // owner can modify it (404 if missing, 403 if it belongs to someone else).
    async update(entryId, actor, body) {
        return this.time.update(entryId, actor.id, {
            durationSec: body.durationSec,
            description: body.description,
            isBillable: body.isBillable,
            startedAt: body.startedAt ? new Date(body.startedAt) : undefined,
        });
    }
    async remove(entryId, actor) {
        return this.time.remove(entryId, actor.id);
    }
    async monthly(workspaceId, actor, months) {
        const rows = await this.time.getMonthlyTimesheet(workspaceId, months ? parseInt(months, 10) : 6);
        const canModerate = await this.time.canModerateApprovals(workspaceId, actor.id);
        // Members see only their own monthly rows.
        return canModerate ? rows : rows.filter((r) => r.userId === actor.id);
    }
    // A5.14 — the team timesheet grid: one row per person, seven weekday columns.
    async teamWeek(workspaceId, actor, weekStart) {
        const rows = await this.time.getTeamWeek(workspaceId, this.time.parseWeekStart(weekStart));
        const canModerate = await this.time.canModerateApprovals(workspaceId, actor.id);
        // Same rule as the monthly rollup: members see only their own row.
        return canModerate ? rows : rows.filter((r) => r.userId === actor.id);
    }
    listApprovals(workspaceId, actor, status) {
        return Promise.all([
            this.time.canModerateApprovals(workspaceId, actor.id),
            this.time.listApprovals(workspaceId, status),
        ]).then(([canModerate, items]) => ({
            canModerate,
            // Non-moderators only see their own timesheet rows.
            items: canModerate ? items : items.filter((i) => i.userId === actor.id),
        }));
    }
    submitTimesheet(workspaceId, actor, body) {
        return this.time.submitTimesheet(workspaceId, actor.id, body.weekStart);
    }
    approveTimesheet(workspaceId, userId, weekStart, actor) {
        return this.time.setApprovalStatus(workspaceId, userId, weekStart, actor.id, { status: 'approved' });
    }
    rejectTimesheet(workspaceId, userId, weekStart, actor, body) {
        return this.time.setApprovalStatus(workspaceId, userId, weekStart, actor.id, {
            status: 'rejected',
            reason: body?.reason ?? null,
        });
    }
};
exports.WorkspaceTimeEntriesController = WorkspaceTimeEntriesController;
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/time-entries'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('userId')),
    __param(3, (0, common_1.Query)('since')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, String]),
    __metadata("design:returntype", Promise)
], WorkspaceTimeEntriesController.prototype, "list", null);
__decorate([
    (0, common_1.Patch)('time-entries/:entryId'),
    __param(0, (0, common_1.Param)('entryId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], WorkspaceTimeEntriesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)('time-entries/:entryId'),
    __param(0, (0, common_1.Param)('entryId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], WorkspaceTimeEntriesController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/time-monthly'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('months')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], WorkspaceTimeEntriesController.prototype, "monthly", null);
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/time-team-week'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('weekStart')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], WorkspaceTimeEntriesController.prototype, "teamWeek", null);
__decorate([
    (0, common_1.Get)('workspaces/:workspaceId/time-approvals'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", void 0)
], WorkspaceTimeEntriesController.prototype, "listApprovals", null);
__decorate([
    (0, common_1.Post)('workspaces/:workspaceId/time-approvals/submit'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], WorkspaceTimeEntriesController.prototype, "submitTimesheet", null);
__decorate([
    (0, common_1.Post)('workspaces/:workspaceId/time-approvals/:userId/:weekStart/approve'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard, workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, common_1.Param)('weekStart')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", void 0)
], WorkspaceTimeEntriesController.prototype, "approveTimesheet", null);
__decorate([
    (0, common_1.Post)('workspaces/:workspaceId/time-approvals/:userId/:weekStart/reject'),
    (0, common_1.UseGuards)(workspace_member_guard_1.WorkspaceMemberGuard, workspace_admin_guard_1.WorkspaceAdminGuard),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, common_1.Param)('weekStart')),
    __param(3, (0, current_user_decorator_1.CurrentUser)()),
    __param(4, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object, Object]),
    __metadata("design:returntype", void 0)
], WorkspaceTimeEntriesController.prototype, "rejectTimesheet", null);
exports.WorkspaceTimeEntriesController = WorkspaceTimeEntriesController = __decorate([
    (0, swagger_1.ApiTags)('time-entries'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [time_entries_service_1.TimeEntriesService])
], WorkspaceTimeEntriesController);
//# sourceMappingURL=time-entries.controller.js.map