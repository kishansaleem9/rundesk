"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomRolesModule = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("../../common/database/database.module");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
const security_module_1 = require("../security/security.module");
const custom_roles_service_1 = require("./custom-roles.service");
const custom_roles_controller_1 = require("./custom-roles.controller");
const permissions_guard_1 = require("./permissions.guard");
let CustomRolesModule = class CustomRolesModule {
};
exports.CustomRolesModule = CustomRolesModule;
exports.CustomRolesModule = CustomRolesModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule, security_module_1.SecurityModule],
        controllers: [custom_roles_controller_1.CustomRolesController, custom_roles_controller_1.MemberRolesController],
        providers: [custom_roles_service_1.CustomRolesService, permissions_guard_1.PermissionsGuard, workspace_member_guard_1.WorkspaceMemberGuard, workspace_admin_guard_1.WorkspaceAdminGuard],
        exports: [custom_roles_service_1.CustomRolesService, permissions_guard_1.PermissionsGuard],
    })
], CustomRolesModule);
//# sourceMappingURL=custom-roles.module.js.map