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
var NotificationDigestService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationDigestService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const config_1 = require("@nestjs/config");
const notifications_service_1 = require("./notifications.service");
const email_service_1 = require("../email/email.service");
/**
 * Sends periodic (daily/weekly) digests of unread notifications to users who
 * opted in via their notification preferences. Runs hourly and only emails the
 * users whose configured send-hour matches the current hour (weekly digests
 * additionally gated to Mondays).
 */
let NotificationDigestService = NotificationDigestService_1 = class NotificationDigestService {
    constructor(notifications, email, config) {
        this.notifications = notifications;
        this.email = email;
        this.logger = new common_1.Logger(NotificationDigestService_1.name);
        this.appUrl = config.get('APP_URL') ?? 'http://localhost:5173';
    }
    async runHourly() {
        const now = new Date();
        return this.dispatch(now, now.getUTCHours(), now.getUTCDay() === 1);
    }
    /**
     * Dispatch digests due at `hour`. Extracted from the cron so it can be
     * driven deterministically in tests.
     */
    async dispatch(now, hour, isWeeklyDay) {
        const recipients = await this.notifications.listDigestRecipients();
        let sent = 0;
        for (const r of recipients) {
            if (r.hour !== hour)
                continue;
            if (r.frequency === 'weekly' && !isWeeklyDay)
                continue;
            const digest = await this.notifications.buildDigest(r.userId, r.frequency, now);
            if (digest.total === 0)
                continue;
            try {
                await this.email.sendDigest({
                    to: r.email,
                    recipientName: r.displayName ?? r.email,
                    frequency: r.frequency,
                    total: digest.total,
                    groups: digest.groups,
                    appUrl: this.appUrl,
                });
                sent += 1;
            }
            catch (err) {
                this.logger.error(`Digest send failed for ${r.userId}: ${err.message}`);
            }
        }
        if (sent > 0)
            this.logger.log(`Sent ${sent} notification digest(s) for hour ${hour}`);
        return { candidates: recipients.length, sent };
    }
};
exports.NotificationDigestService = NotificationDigestService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_HOUR),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], NotificationDigestService.prototype, "runHourly", null);
exports.NotificationDigestService = NotificationDigestService = NotificationDigestService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [notifications_service_1.NotificationsService,
        email_service_1.EmailService,
        config_1.ConfigService])
], NotificationDigestService);
//# sourceMappingURL=notification-digest.service.js.map