"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SampleDataModule = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("../../common/database/database.module");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
const security_module_1 = require("../security/security.module");
const sample_data_service_1 = require("./sample-data.service");
const sample_data_controller_1 = require("./sample-data.controller");
let SampleDataModule = class SampleDataModule {
};
exports.SampleDataModule = SampleDataModule;
exports.SampleDataModule = SampleDataModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule, security_module_1.SecurityModule],
        controllers: [sample_data_controller_1.SampleDataController],
        providers: [sample_data_service_1.SampleDataService, workspace_admin_guard_1.WorkspaceAdminGuard],
        exports: [sample_data_service_1.SampleDataService],
    })
], SampleDataModule);
//# sourceMappingURL=sample-data.module.js.map