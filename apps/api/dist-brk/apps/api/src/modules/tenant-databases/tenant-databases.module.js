"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantDatabasesModule = void 0;
const common_1 = require("@nestjs/common");
const tenant_databases_service_1 = require("./tenant-databases.service");
const tenant_databases_controller_1 = require("./tenant-databases.controller");
const auth_module_1 = require("../auth/auth.module");
/**
 * §14.2 Optional dedicated-database tier. Registry + connection resolver that
 * routes an enterprise org's queries to its own Postgres when configured, else
 * the shared cluster. The service is exported so other modules can consult the
 * resolver (`getDbForOrganization`); per-request routing remains opt-in.
 */
let TenantDatabasesModule = class TenantDatabasesModule {
};
exports.TenantDatabasesModule = TenantDatabasesModule;
exports.TenantDatabasesModule = TenantDatabasesModule = __decorate([
    (0, common_1.Module)({
        imports: [auth_module_1.AuthModule],
        controllers: [tenant_databases_controller_1.TenantDatabasesController],
        providers: [tenant_databases_service_1.TenantDatabasesService],
        exports: [tenant_databases_service_1.TenantDatabasesService],
    })
], TenantDatabasesModule);
//# sourceMappingURL=tenant-databases.module.js.map