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
exports.OpsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const ops_service_1 = require("./ops.service");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
/**
 * §14.5 SaaS Ops Dashboard (Internal). Both routes are super-admin only — they
 * expose cross-tenant platform metrics. The gate mirrors OrganizationsController.
 */
let OpsController = class OpsController {
    constructor(ops) {
        this.ops = ops;
    }
    async metrics(user) {
        if (user.role !== 'super_admin')
            throw new common_1.ForbiddenException('Super admin access required');
        return this.ops.getMetrics();
    }
    async organizations(user) {
        if (user.role !== 'super_admin')
            throw new common_1.ForbiddenException('Super admin access required');
        return this.ops.getOrganizations();
    }
};
exports.OpsController = OpsController;
__decorate([
    (0, common_1.Get)('metrics'),
    (0, swagger_1.ApiOperation)({ summary: 'Platform-wide SaaS ops metrics (super admin)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OpsController.prototype, "metrics", null);
__decorate([
    (0, common_1.Get)('organizations'),
    (0, swagger_1.ApiOperation)({ summary: 'Per-organization ops rows (super admin)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OpsController.prototype, "organizations", null);
exports.OpsController = OpsController = __decorate([
    (0, swagger_1.ApiTags)('ops'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('ops'),
    __metadata("design:paramtypes", [ops_service_1.OpsService])
], OpsController);
//# sourceMappingURL=ops.controller.js.map