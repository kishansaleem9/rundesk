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
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const drizzle_orm_1 = require("drizzle-orm");
const database_module_1 = require("../../common/database/database.module");
let HealthController = class HealthController {
    constructor(db) {
        this.db = db;
        this.startedAt = Date.now();
    }
    live() {
        return {
            status: 'ok',
            uptimeMs: Date.now() - this.startedAt,
            timestamp: new Date().toISOString(),
        };
    }
    async ready() {
        const checks = {};
        const dbStart = Date.now();
        try {
            await this.db.execute((0, drizzle_orm_1.sql) `select 1`);
            checks.database = { ok: true, latencyMs: Date.now() - dbStart };
        }
        catch (err) {
            checks.database = { ok: false, error: err.message };
        }
        const allOk = Object.values(checks).every((c) => c.ok);
        const body = {
            status: allOk ? 'ok' : 'degraded',
            checks,
            timestamp: new Date().toISOString(),
        };
        if (!allOk)
            throw new common_1.ServiceUnavailableException(body);
        return body;
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Liveness probe — returns 200 if the process is up' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "live", null);
__decorate([
    (0, common_1.Get)('ready'),
    (0, swagger_1.ApiOperation)({ summary: 'Readiness probe — fails if critical dependencies are unreachable' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "ready", null);
exports.HealthController = HealthController = __decorate([
    (0, swagger_1.ApiTags)('health'),
    (0, common_1.Controller)('health'),
    __param(0, (0, common_1.Inject)(database_module_1.DB_TOKEN)),
    __metadata("design:paramtypes", [Object])
], HealthController);
//# sourceMappingURL=health.controller.js.map