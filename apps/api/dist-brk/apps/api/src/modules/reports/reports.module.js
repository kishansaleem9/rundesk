"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsModule = void 0;
const common_1 = require("@nestjs/common");
const reports_service_1 = require("./reports.service");
const scheduled_reports_service_1 = require("./scheduled-reports.service");
const project_health_service_1 = require("./project-health.service");
const reports_controller_1 = require("./reports.controller");
const database_module_1 = require("../../common/database/database.module");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const custom_roles_module_1 = require("../custom-roles/custom-roles.module");
const email_module_1 = require("../email/email.module");
const ai_module_1 = require("../ai/ai.module");
let ReportsModule = class ReportsModule {
};
exports.ReportsModule = ReportsModule;
exports.ReportsModule = ReportsModule = __decorate([
    (0, common_1.Module)({
        // AiModule supplies AiService for the project-health sentiment component
        // (§7.13); it is a leaf of this module's dependency graph, so importing it
        // here introduces no cycle.
        imports: [database_module_1.DatabaseModule, custom_roles_module_1.CustomRolesModule, email_module_1.EmailModule, ai_module_1.AiModule],
        controllers: [reports_controller_1.ReportsController],
        // ProjectHealthService owns the daily @Cron that persists project-health
        // scores — it must be provided here or the cron never registers.
        providers: [reports_service_1.ReportsService, scheduled_reports_service_1.ScheduledReportsService, project_health_service_1.ProjectHealthService, workspace_member_guard_1.WorkspaceMemberGuard],
    })
], ReportsModule);
//# sourceMappingURL=reports.module.js.map