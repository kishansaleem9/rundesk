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
var RateLimitCleanupService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitCleanupService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("@rundesk/db");
const database_module_1 = require("../database/database.module");
/**
 * Hourly sweep of the shared rate-limit counter table backing
 * {@link ../guards/rate-limit.guard RateLimitGuard}. Fixed-window rows in
 * `rate_limit_counters` are only meaningful until their window ends; without a
 * sweep the table would accumulate one dead row per `(route, ip, window)`
 * forever. Deleting rows whose `expires_at` has passed keeps it bounded (the
 * `rate_limit_counters_expires_idx` index makes the delete cheap).
 *
 * Best-effort: a failed sweep is logged and retried on the next tick — it must
 * never throw into the scheduler, and a missed sweep only delays cleanup.
 */
let RateLimitCleanupService = RateLimitCleanupService_1 = class RateLimitCleanupService {
    constructor(db) {
        this.db = db;
        this.logger = new common_1.Logger(RateLimitCleanupService_1.name);
    }
    /** Delete every counter row whose window has already ended. */
    async sweepExpired() {
        try {
            await this.db.delete(db_1.rateLimitCounters).where((0, drizzle_orm_1.lt)(db_1.rateLimitCounters.expiresAt, new Date()));
        }
        catch (err) {
            this.logger.error('Rate-limit counter sweep failed', err);
        }
    }
};
exports.RateLimitCleanupService = RateLimitCleanupService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_HOUR),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RateLimitCleanupService.prototype, "sweepExpired", null);
exports.RateLimitCleanupService = RateLimitCleanupService = RateLimitCleanupService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], RateLimitCleanupService);
//# sourceMappingURL=rate-limit-cleanup.service.js.map