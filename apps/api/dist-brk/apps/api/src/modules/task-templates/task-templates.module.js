"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskTemplatesModule = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("../../common/database/database.module");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
const tasks_module_1 = require("../tasks/tasks.module");
const security_module_1 = require("../security/security.module");
const custom_roles_module_1 = require("../custom-roles/custom-roles.module");
const task_templates_service_1 = require("./task-templates.service");
const task_templates_controller_1 = require("./task-templates.controller");
let TaskTemplatesModule = class TaskTemplatesModule {
};
exports.TaskTemplatesModule = TaskTemplatesModule;
exports.TaskTemplatesModule = TaskTemplatesModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule, tasks_module_1.TasksModule, security_module_1.SecurityModule, custom_roles_module_1.CustomRolesModule],
        controllers: [task_templates_controller_1.TaskTemplatesController],
        providers: [task_templates_service_1.TaskTemplatesService, workspace_member_guard_1.WorkspaceMemberGuard, workspace_admin_guard_1.WorkspaceAdminGuard],
        exports: [task_templates_service_1.TaskTemplatesService],
    })
], TaskTemplatesModule);
//# sourceMappingURL=task-templates.module.js.map