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
exports.NotificationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const notifications_service_1 = require("./notifications.service");
/** Longest a notification may be parked in Later — a year of snoozes is a bug, not a wish. */
const MAX_SNOOZE_MS = 365 * 24 * 3600_000;
let NotificationsController = class NotificationsController {
    constructor(notifications) {
        this.notifications = notifications;
    }
    list(user, unreadOnly, view) {
        return this.notifications.list(user.id, {
            unreadOnly: unreadOnly === 'true',
            view: notifications_service_1.INBOX_VIEWS.includes(view ?? '') ? view : undefined,
        });
    }
    unreadCount(user) {
        return this.notifications.unreadCount(user.id);
    }
    unreadByWorkspace(user) {
        return this.notifications.unreadByWorkspace(user.id);
    }
    triageCounts(user) {
        return this.notifications.triageCounts(user.id);
    }
    digestPreview(user, frequency) {
        const freq = frequency === 'weekly' ? 'weekly' : 'daily';
        return this.notifications.buildDigest(user.id, freq);
    }
    getPreferences(user) {
        return this.notifications.getPreferences(user.id);
    }
    updatePreferences(user, body) {
        return this.notifications.updatePreferences(user.id, body);
    }
    /**
     * §G06 [06:53] — mute for a length of time.
     *
     * "NOTIFICATIONS, Mute ka option hai" — the row in the frames carries a "›",
     * i.e. a submenu of durations. Ours was a switch that stayed flipped until
     * somebody remembered to flip it back, so muting for one meeting muted you
     * for days.
     *
     * `minutes: null` (or 0) clears it. The scheduled quiet hours in preferences
     * are a separate control and are untouched by this.
     */
    muteFor(user, body) {
        return this.notifications.setTimedMute(user.id, body?.minutes ?? null);
    }
    getMute(user) {
        return this.notifications.getTimedMute(user.id);
    }
    webPushPublicKey() {
        return this.notifications.getWebPushPublicKey();
    }
    subscribeWebPush(user, body, userAgent) {
        return this.notifications.subscribeWebPush(user.id, body.subscription, userAgent);
    }
    unsubscribeWebPush(user, body) {
        return this.notifications.unsubscribeWebPush(user.id, body.endpoint);
    }
    markRead(notificationId, user) {
        return this.notifications.markRead(user.id, notificationId);
    }
    /** §G12 [16:56] — put a row back the way it was before you opened it. */
    markUnread(notificationId, user) {
        return this.notifications.markUnread(user.id, notificationId);
    }
    markAllRead(user) {
        return this.notifications.markAllRead(user.id);
    }
    /**
     * §2.5 — clear everything in the Inbox at once. `types` narrows it to what
     * the Primary chip is showing, so clearing while filtered does not also bin
     * what the filter was hiding.
     */
    clearAll(user, body) {
        const types = Array.isArray(body?.types)
            ? body.types.filter((t) => typeof t === 'string')
            : undefined;
        return this.notifications.clearAll(user.id, { types });
    }
    clear(notificationId, user) {
        return this.notifications.clear(user.id, notificationId);
    }
    unclear(notificationId, user) {
        return this.notifications.unclear(user.id, notificationId);
    }
    snooze(notificationId, user, body) {
        const until = resolveSnoozeUntil(body);
        if (!until)
            throw new common_1.BadRequestException('until must be a future timestamp within a year');
        return this.notifications.snooze(user.id, notificationId, until);
    }
    unsnooze(notificationId, user) {
        return this.notifications.unsnooze(user.id, notificationId);
    }
    sendTest(user, body) {
        return this.notifications.sendTest(user.id, body?.workspaceId ?? null);
    }
};
exports.NotificationsController = NotificationsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('unreadOnly')),
    __param(2, (0, common_1.Query)('view')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('unread-count'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "unreadCount", null);
__decorate([
    (0, common_1.Get)('unread-by-workspace'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "unreadByWorkspace", null);
__decorate([
    (0, common_1.Get)('counts'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "triageCounts", null);
__decorate([
    (0, common_1.Get)('digest/preview'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('frequency')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "digestPreview", null);
__decorate([
    (0, common_1.Get)('preferences'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "getPreferences", null);
__decorate([
    (0, common_1.Post)('preferences'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "updatePreferences", null);
__decorate([
    (0, common_1.Post)('mute'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "muteFor", null);
__decorate([
    (0, common_1.Get)('mute'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "getMute", null);
__decorate([
    (0, common_1.Get)('web-push/public-key'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "webPushPublicKey", null);
__decorate([
    (0, common_1.Post)('web-push/subscribe'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('user-agent')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "subscribeWebPush", null);
__decorate([
    (0, common_1.Post)('web-push/unsubscribe'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "unsubscribeWebPush", null);
__decorate([
    (0, common_1.Post)(':notificationId/read'),
    __param(0, (0, common_1.Param)('notificationId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "markRead", null);
__decorate([
    (0, common_1.Post)(':notificationId/unread'),
    __param(0, (0, common_1.Param)('notificationId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "markUnread", null);
__decorate([
    (0, common_1.Post)('mark-all-read'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "markAllRead", null);
__decorate([
    (0, common_1.Post)('clear-all'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "clearAll", null);
__decorate([
    (0, common_1.Post)(':notificationId/clear'),
    __param(0, (0, common_1.Param)('notificationId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "clear", null);
__decorate([
    (0, common_1.Post)(':notificationId/unclear'),
    __param(0, (0, common_1.Param)('notificationId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "unclear", null);
__decorate([
    (0, common_1.Post)(':notificationId/snooze'),
    __param(0, (0, common_1.Param)('notificationId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "snooze", null);
__decorate([
    (0, common_1.Post)(':notificationId/unsnooze'),
    __param(0, (0, common_1.Param)('notificationId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "unsnooze", null);
__decorate([
    (0, common_1.Post)('test'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "sendTest", null);
exports.NotificationsController = NotificationsController = __decorate([
    (0, swagger_1.ApiTags)('notifications'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('notifications'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [notifications_service_1.NotificationsService])
], NotificationsController);
/**
 * Accept either an explicit timestamp or a relative hour offset, and reject
 * anything in the past or absurdly far out — a bad `until` would otherwise park
 * a notification in Later with no way back except un-snoozing it by hand.
 */
function resolveSnoozeUntil(body) {
    const now = Date.now();
    let ms = null;
    if (typeof body?.hours === 'number' && Number.isFinite(body.hours)) {
        ms = now + body.hours * 3600_000;
    }
    else if (typeof body?.until === 'string') {
        const parsed = new Date(body.until).getTime();
        if (Number.isFinite(parsed))
            ms = parsed;
    }
    if (ms === null || ms <= now || ms > now + MAX_SNOOZE_MS)
        return null;
    return new Date(ms);
}
//# sourceMappingURL=notifications.controller.js.map