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
var NotificationRetentionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationRetentionService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../../common/database/database.module");
/**
 * §2.5 — cleared notifications age out.
 *
 * > "after 30 DAYS baad woh saare notifications automatically VANISH ho
 * > jayenge. ClickUp ka storage system TRASH ki tarah hi hai."
 *
 * Clearing a notification is the user saying they are done with it, and until
 * now that meant it sat in the Cleared bucket for ever. Trash already works
 * this way; notifications did not.
 *
 * Deliberately narrow. Only rows the user has actually dismissed are eligible,
 * and only by when they were dismissed — not by when they were created, which
 * would delete a notification someone cleared this morning because the event it
 * describes was old. Anything still in the Inbox, or snoozed to Later, is left
 * alone however long it has been there: nobody asked for their unread mentions
 * to be deleted.
 */
let NotificationRetentionService = NotificationRetentionService_1 = class NotificationRetentionService {
    constructor(db) {
        this.db = db;
        this.logger = new common_1.Logger(NotificationRetentionService_1.name);
    }
    /**
     * Announce the policy on boot. The job itself first runs at 4am, which is a
     * long time to wait to find out whether a deploy wired it up — this line in
     * the container log is what deploy/verify-release.sh checks.
     */
    onModuleInit() {
        this.logger.log(`notification retention active: cleared notifications are deleted after ${NotificationRetentionService_1.RETENTION_DAYS} days`);
    }
    async runDaily() {
        return this.purge(new Date());
    }
    /**
     * Delete cleared notifications dismissed more than RETENTION_DAYS before
     * `now`. Takes the clock as an argument so the boundary can be tested at all
     * — a job that only ever runs against "today" is a job whose off-by-one you
     * find in production.
     */
    async purge(now) {
        const cutoff = new Date(now.getTime() - NotificationRetentionService_1.RETENTION_DAYS * 24 * 60 * 60 * 1000);
        const deleted = await this.db
            .delete(db_1.notifications)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.isNotNull)(db_1.notifications.dismissedAt), (0, drizzle_orm_1.lt)(db_1.notifications.dismissedAt, cutoff)))
            .returning({ id: db_1.notifications.id });
        if (deleted.length > 0) {
            this.logger.log(`purged ${deleted.length} cleared notification(s) dismissed before ${cutoff.toISOString()}`);
        }
        return deleted.length;
    }
    /**
     * What the purge would remove, without removing it. Used by the deploy
     * verification, which needs to know the job is wired up without waiting a
     * day or destroying anything to find out.
     */
    async countDue(now) {
        const cutoff = new Date(now.getTime() - NotificationRetentionService_1.RETENTION_DAYS * 24 * 60 * 60 * 1000);
        const [row] = await this.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(db_1.notifications)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.isNotNull)(db_1.notifications.dismissedAt), (0, drizzle_orm_1.lt)(db_1.notifications.dismissedAt, cutoff)));
        return row?.count ?? 0;
    }
};
exports.NotificationRetentionService = NotificationRetentionService;
/** How long a cleared notification is kept. Her number. */
NotificationRetentionService.RETENTION_DAYS = 30;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_4AM, { name: 'notification-retention' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], NotificationRetentionService.prototype, "runDaily", null);
exports.NotificationRetentionService = NotificationRetentionService = NotificationRetentionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], NotificationRetentionService);
//# sourceMappingURL=notification-retention.service.js.map