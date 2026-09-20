"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SsoModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const sso_service_1 = require("./sso.service");
const scim_service_1 = require("./scim.service");
const sso_controller_1 = require("./sso.controller");
const scim_controller_1 = require("./scim.controller");
const security_module_1 = require("../security/security.module");
const auth_module_1 = require("../auth/auth.module");
const workspace_groups_module_1 = require("../workspace-groups/workspace-groups.module");
const custom_roles_module_1 = require("../custom-roles/custom-roles.module");
let SsoModule = class SsoModule {
};
exports.SsoModule = SsoModule;
exports.SsoModule = SsoModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule, security_module_1.SecurityModule, (0, common_1.forwardRef)(() => auth_module_1.AuthModule), workspace_groups_module_1.WorkspaceGroupsModule, custom_roles_module_1.CustomRolesModule],
        controllers: [sso_controller_1.SsoAdminController, sso_controller_1.SsoAuthController, scim_controller_1.ScimAdminController, scim_controller_1.ScimController],
        providers: [sso_service_1.SsoService, scim_service_1.ScimService],
        exports: [sso_service_1.SsoService, scim_service_1.ScimService],
    })
], SsoModule);
//# sourceMappingURL=sso.module.js.map