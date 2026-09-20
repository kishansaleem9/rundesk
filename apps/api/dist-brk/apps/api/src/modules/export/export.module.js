"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportModule = void 0;
const common_1 = require("@nestjs/common");
const export_service_1 = require("./export.service");
const export_controller_1 = require("./export.controller");
const database_module_1 = require("../../common/database/database.module");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
const security_module_1 = require("../security/security.module");
const workspaces_module_1 = require("../workspaces/workspaces.module");
let ExportModule = class ExportModule {
};
exports.ExportModule = ExportModule;
exports.ExportModule = ExportModule = __decorate([
    (0, common_1.Module)({
        // §A4.1 — the roster CSV reuses WorkspacesService.listMembers so the export and
        // the People screen can never drift apart.
        imports: [database_module_1.DatabaseModule, security_module_1.SecurityModule, workspaces_module_1.WorkspacesModule],
        controllers: [export_controller_1.ExportController],
        providers: [export_service_1.ExportService, workspace_member_guard_1.WorkspaceMemberGuard, workspace_admin_guard_1.WorkspaceAdminGuard],
    })
], ExportModule);
//# sourceMappingURL=export.module.js.map