"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityModule = void 0;
const common_1 = require("@nestjs/common");
const security_service_1 = require("./security.service");
const workspace_security_settings_service_1 = require("./workspace-security-settings.service");
const security_controller_1 = require("./security.controller");
const security_settings_controller_1 = require("./security-settings.controller");
const database_module_1 = require("../../common/database/database.module");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
let SecurityModule = class SecurityModule {
};
exports.SecurityModule = SecurityModule;
exports.SecurityModule = SecurityModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule],
        controllers: [security_controller_1.TotpController, security_controller_1.ApiKeysController, security_controller_1.AuditLogsController, security_settings_controller_1.SecuritySettingsController],
        providers: [security_service_1.SecurityService, workspace_security_settings_service_1.WorkspaceSecuritySettingsService, workspace_member_guard_1.WorkspaceMemberGuard, workspace_admin_guard_1.WorkspaceAdminGuard],
        exports: [security_service_1.SecurityService, workspace_security_settings_service_1.WorkspaceSecuritySettingsService],
    })
], SecurityModule);
//# sourceMappingURL=security.module.js.map