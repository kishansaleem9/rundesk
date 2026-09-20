"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectTemplatesModule = void 0;
const common_1 = require("@nestjs/common");
const project_templates_service_1 = require("./project-templates.service");
const project_templates_controller_1 = require("./project-templates.controller");
const database_module_1 = require("../../common/database/database.module");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
const spaces_module_1 = require("../spaces/spaces.module");
let ProjectTemplatesModule = class ProjectTemplatesModule {
};
exports.ProjectTemplatesModule = ProjectTemplatesModule;
exports.ProjectTemplatesModule = ProjectTemplatesModule = __decorate([
    (0, common_1.Module)({
        // §V2-13 — a `space` template makes its space through the spaces service, so
        // a space born from a template gets the creator membership and the defaults
        // a hand-made one does. SpacesModule does not reach back here, so no cycle.
        imports: [database_module_1.DatabaseModule, spaces_module_1.SpacesModule],
        controllers: [project_templates_controller_1.ProjectTemplatesController],
        providers: [project_templates_service_1.ProjectTemplatesService, workspace_member_guard_1.WorkspaceMemberGuard, workspace_admin_guard_1.WorkspaceAdminGuard],
        exports: [project_templates_service_1.ProjectTemplatesService],
    })
], ProjectTemplatesModule);
//# sourceMappingURL=project-templates.module.js.map