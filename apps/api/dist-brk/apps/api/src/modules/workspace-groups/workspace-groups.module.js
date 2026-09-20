"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceGroupsModule = void 0;
const common_1 = require("@nestjs/common");
const workspace_groups_service_1 = require("./workspace-groups.service");
const workspace_groups_controller_1 = require("./workspace-groups.controller");
const security_module_1 = require("../security/security.module");
const auth_module_1 = require("../auth/auth.module");
let WorkspaceGroupsModule = class WorkspaceGroupsModule {
};
exports.WorkspaceGroupsModule = WorkspaceGroupsModule;
exports.WorkspaceGroupsModule = WorkspaceGroupsModule = __decorate([
    (0, common_1.Module)({
        imports: [security_module_1.SecurityModule, auth_module_1.AuthModule],
        controllers: [workspace_groups_controller_1.WorkspaceGroupsController, workspace_groups_controller_1.TeamsHubController],
        providers: [workspace_groups_service_1.WorkspaceGroupsService],
        exports: [workspace_groups_service_1.WorkspaceGroupsService],
    })
], WorkspaceGroupsModule);
//# sourceMappingURL=workspace-groups.module.js.map