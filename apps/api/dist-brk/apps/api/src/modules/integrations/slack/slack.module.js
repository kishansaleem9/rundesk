"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlackModule = void 0;
const common_1 = require("@nestjs/common");
const slack_service_1 = require("./slack.service");
const slack_controller_1 = require("./slack.controller");
const database_module_1 = require("../../../common/database/database.module");
const workspace_member_guard_1 = require("../../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../../auth/guards/workspace-admin.guard");
let SlackModule = class SlackModule {
};
exports.SlackModule = SlackModule;
exports.SlackModule = SlackModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule],
        controllers: [slack_controller_1.SlackController],
        providers: [slack_service_1.SlackService, workspace_member_guard_1.WorkspaceMemberGuard, workspace_admin_guard_1.WorkspaceAdminGuard],
        exports: [slack_service_1.SlackService],
    })
], SlackModule);
//# sourceMappingURL=slack.module.js.map