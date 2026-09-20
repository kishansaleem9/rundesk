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
exports.IcalFeedController = exports.CalendarSyncController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const resource_member_guard_1 = require("../auth/guards/resource-member.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const calendar_sync_service_1 = require("./calendar-sync.service");
const calendar_accounts_service_1 = require("./calendar-accounts.service");
/**
 * Authenticated controller: iCal token mint/revoke + manual pull triggers.
 */
let CalendarSyncController = class CalendarSyncController {
    constructor(sync, accounts) {
        this.sync = sync;
        this.accounts = accounts;
    }
    /**
     * §V2-14, frame `13:50` — "Accounts: Manage your accounts".
     *
     * Everything here is scoped to the CALLER, never to a userId in the path.
     * These rows hold OAuth refresh tokens for somebody's personal calendar, so
     * "whose account is this" is answered by the session and by nothing else.
     */
    listAccounts(user, workspaceId) {
        return this.accounts.list(user.id, workspaceId);
    }
    /** "Default calendar" — where new events are written. */
    setDefaultAccount(user, workspaceId, accountId) {
        return this.accounts.setDefault(user.id, workspaceId, accountId);
    }
    /** "Busy calendars" — whether this one is read when working out free time. */
    setAccountBusy(user, workspaceId, accountId, body) {
        return this.accounts.setCountsAsBusy(user.id, workspaceId, accountId, body.countsAsBusy === true);
    }
    removeAccount(user, workspaceId, accountId) {
        return this.accounts.remove(user.id, workspaceId, accountId);
    }
    async getToken(user, workspaceId) {
        // Read (or first-time mint) without rotating an existing subscription URL.
        return this.sync.getOrCreateIcalToken(user.id, workspaceId);
    }
    async mintToken(user, workspaceId) {
        return this.sync.mintIcalToken(user.id, workspaceId);
    }
    async revokeToken(user, workspaceId) {
        await this.sync.revokeIcalToken(user.id, workspaceId);
        return { ok: true };
    }
    async pull(workspaceId, provider) {
        return this.sync.pullEvents(workspaceId, provider);
    }
    async pushTask(workspaceId, taskId) {
        return this.sync.pushTask(taskId, workspaceId);
    }
};
exports.CalendarSyncController = CalendarSyncController;
__decorate([
    (0, common_1.Get)('accounts'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CalendarSyncController.prototype, "listAccounts", null);
__decorate([
    (0, common_1.Post)('accounts/:accountId/default'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('workspaceId')),
    __param(2, (0, common_1.Param)('accountId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], CalendarSyncController.prototype, "setDefaultAccount", null);
__decorate([
    (0, common_1.Patch)('accounts/:accountId/busy'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('workspaceId')),
    __param(2, (0, common_1.Param)('accountId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], CalendarSyncController.prototype, "setAccountBusy", null);
__decorate([
    (0, common_1.Delete)('accounts/:accountId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('workspaceId')),
    __param(2, (0, common_1.Param)('accountId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], CalendarSyncController.prototype, "removeAccount", null);
__decorate([
    (0, common_1.Get)('ical-token'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CalendarSyncController.prototype, "getToken", null);
__decorate([
    (0, common_1.Post)('ical-token'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CalendarSyncController.prototype, "mintToken", null);
__decorate([
    (0, common_1.Delete)('ical-token'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('workspaceId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CalendarSyncController.prototype, "revokeToken", null);
__decorate([
    (0, common_1.Post)(':provider/pull'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('provider')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], CalendarSyncController.prototype, "pull", null);
__decorate([
    (0, common_1.Post)('tasks/:taskId/push'),
    __param(0, (0, common_1.Param)('workspaceId')),
    __param(1, (0, common_1.Param)('taskId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], CalendarSyncController.prototype, "pushTask", null);
exports.CalendarSyncController = CalendarSyncController = __decorate([
    (0, swagger_1.ApiTags)('calendar-sync'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('workspaces/:workspaceId/calendar-sync'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, resource_member_guard_1.ResourceMemberGuard),
    __metadata("design:paramtypes", [calendar_sync_service_1.CalendarSyncService,
        calendar_accounts_service_1.CalendarAccountsService])
], CalendarSyncController);
/**
 * Unauthenticated controller: serves the public iCal feed. Authorization
 * is by the URL token (mint/revoke via the authenticated controller).
 */
let IcalFeedController = class IcalFeedController {
    constructor(sync) {
        this.sync = sync;
    }
    async serve(token, res) {
        const ctx = await this.sync.resolveIcalToken(token);
        if (!ctx) {
            res.status(404).send('Not found');
            return;
        }
        const ics = await this.sync.buildIcalFeed(ctx.userId, ctx.workspaceId);
        res
            .status(200)
            .header('Content-Type', 'text/calendar; charset=utf-8')
            .header('Cache-Control', 'private, no-cache, max-age=60')
            .send(ics);
    }
};
exports.IcalFeedController = IcalFeedController;
__decorate([
    (0, common_1.Get)(':token.ics'),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], IcalFeedController.prototype, "serve", null);
exports.IcalFeedController = IcalFeedController = __decorate([
    (0, swagger_1.ApiTags)('calendar-sync'),
    (0, common_1.Controller)('ical'),
    __metadata("design:paramtypes", [calendar_sync_service_1.CalendarSyncService])
], IcalFeedController);
//# sourceMappingURL=calendar-sync.controller.js.map