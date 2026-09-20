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
exports.TenantDatabasesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const tenant_databases_service_1 = require("./tenant-databases.service");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
/**
 * §14.2 — super-admin operations surface for the dedicated-database registry.
 * Every handler is gated to `super_admin` (mirrors the org super-admin routes);
 * the raw connection string is only ever accepted on input, never returned.
 */
let TenantDatabasesController = class TenantDatabasesController {
    constructor(tenantDatabases) {
        this.tenantDatabases = tenantDatabases;
    }
    async list(user) {
        if (user.role !== 'super_admin')
            throw new common_1.ForbiddenException('Super admin access required');
        return this.tenantDatabases.listAll();
    }
    async upsert(organizationId, body, user) {
        if (user.role !== 'super_admin')
            throw new common_1.ForbiddenException('Super admin access required');
        return this.tenantDatabases.upsertForOrg(organizationId, body);
    }
    async test(organizationId, user) {
        if (user.role !== 'super_admin')
            throw new common_1.ForbiddenException('Super admin access required');
        return this.tenantDatabases.testConnection(organizationId);
    }
    async provision(organizationId, user) {
        if (user.role !== 'super_admin')
            throw new common_1.ForbiddenException('Super admin access required');
        return this.tenantDatabases.provisionSchema(organizationId);
    }
    async schemaStatus(organizationId, user) {
        if (user.role !== 'super_admin')
            throw new common_1.ForbiddenException('Super admin access required');
        return this.tenantDatabases.getSchemaStatus(organizationId);
    }
    async migrateData(organizationId, body, user) {
        if (user.role !== 'super_admin')
            throw new common_1.ForbiddenException('Super admin access required');
        return this.tenantDatabases.migrateOrgData(organizationId, { dryRun: body?.dryRun ?? false });
    }
    async disable(organizationId, user) {
        if (user.role !== 'super_admin')
            throw new common_1.ForbiddenException('Super admin access required');
        return this.tenantDatabases.disable(organizationId);
    }
    async remove(organizationId, user) {
        if (user.role !== 'super_admin')
            throw new common_1.ForbiddenException('Super admin access required');
        return this.tenantDatabases.remove(organizationId);
    }
};
exports.TenantDatabasesController = TenantDatabasesController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List all tenant databases (masked) — super admin' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], TenantDatabasesController.prototype, "list", null);
__decorate([
    (0, common_1.Put)(':organizationId'),
    (0, swagger_1.ApiOperation)({ summary: 'Create or update an org dedicated-database mapping — super admin' }),
    __param(0, (0, common_1.Param)('organizationId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TenantDatabasesController.prototype, "upsert", null);
__decorate([
    (0, common_1.Post)(':organizationId/test'),
    (0, swagger_1.ApiOperation)({ summary: 'Test the dedicated database connection (select 1) — super admin' }),
    __param(0, (0, common_1.Param)('organizationId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TenantDatabasesController.prototype, "test", null);
__decorate([
    (0, common_1.Post)(':organizationId/provision'),
    (0, swagger_1.ApiOperation)({ summary: 'Provision the dedicated DB schema (run Drizzle migrations) — super admin' }),
    __param(0, (0, common_1.Param)('organizationId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TenantDatabasesController.prototype, "provision", null);
__decorate([
    (0, common_1.Get)(':organizationId/schema-status'),
    (0, swagger_1.ApiOperation)({ summary: 'Report dedicated DB schema presence + reachability — super admin' }),
    __param(0, (0, common_1.Param)('organizationId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TenantDatabasesController.prototype, "schemaStatus", null);
__decorate([
    (0, common_1.Post)(':organizationId/migrate-data'),
    (0, swagger_1.ApiOperation)({ summary: 'Copy the org\'s core data shared → dedicated (supports dryRun) — super admin' }),
    __param(0, (0, common_1.Param)('organizationId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], TenantDatabasesController.prototype, "migrateData", null);
__decorate([
    (0, common_1.Post)(':organizationId/disable'),
    (0, swagger_1.ApiOperation)({ summary: 'Disable routing to the dedicated database — super admin' }),
    __param(0, (0, common_1.Param)('organizationId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TenantDatabasesController.prototype, "disable", null);
__decorate([
    (0, common_1.Delete)(':organizationId'),
    (0, swagger_1.ApiOperation)({ summary: 'Remove the org dedicated-database mapping — super admin' }),
    __param(0, (0, common_1.Param)('organizationId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TenantDatabasesController.prototype, "remove", null);
exports.TenantDatabasesController = TenantDatabasesController = __decorate([
    (0, swagger_1.ApiTags)('tenant-databases'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('ops/tenant-databases'),
    __metadata("design:paramtypes", [tenant_databases_service_1.TenantDatabasesService])
], TenantDatabasesController);
//# sourceMappingURL=tenant-databases.controller.js.map