"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectsModule = void 0;
const common_1 = require("@nestjs/common");
const projects_service_1 = require("./projects.service");
const projects_controller_1 = require("./projects.controller");
const custom_roles_module_1 = require("../custom-roles/custom-roles.module");
const webhooks_module_1 = require("../webhooks/webhooks.module");
const slack_module_1 = require("../integrations/slack/slack.module");
const plans_module_1 = require("../plans/plans.module");
const security_module_1 = require("../security/security.module");
let ProjectsModule = class ProjectsModule {
};
exports.ProjectsModule = ProjectsModule;
exports.ProjectsModule = ProjectsModule = __decorate([
    (0, common_1.Module)({
        imports: [custom_roles_module_1.CustomRolesModule, webhooks_module_1.WebhooksModule, slack_module_1.SlackModule, plans_module_1.PlansModule, security_module_1.SecurityModule],
        providers: [projects_service_1.ProjectsService],
        controllers: [projects_controller_1.ProjectsController],
        exports: [projects_service_1.ProjectsService],
    })
], ProjectsModule);
//# sourceMappingURL=projects.module.js.map