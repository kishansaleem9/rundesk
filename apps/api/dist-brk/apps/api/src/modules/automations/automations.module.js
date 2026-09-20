"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutomationsModule = void 0;
const common_1 = require("@nestjs/common");
const automations_service_1 = require("./automations.service");
const automations_controller_1 = require("./automations.controller");
const database_module_1 = require("../../common/database/database.module");
const realtime_module_1 = require("../realtime/realtime.module");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
// NOTE: post_to_channel (§7.7) posts via a low-level insert in the service, not
// by importing ChatModule — TasksModule already imports AutomationsModule, so
// importing ChatModule (Chat → Tasks → Automations) would form a DI cycle.
// RealtimeModule is a leaf here and only supplies the broadcast gateway.
let AutomationsModule = class AutomationsModule {
};
exports.AutomationsModule = AutomationsModule;
exports.AutomationsModule = AutomationsModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule, realtime_module_1.RealtimeModule],
        controllers: [automations_controller_1.AutomationsController],
        providers: [automations_service_1.AutomationsService, workspace_member_guard_1.WorkspaceMemberGuard, workspace_admin_guard_1.WorkspaceAdminGuard],
        exports: [automations_service_1.AutomationsService],
    })
], AutomationsModule);
//# sourceMappingURL=automations.module.js.map