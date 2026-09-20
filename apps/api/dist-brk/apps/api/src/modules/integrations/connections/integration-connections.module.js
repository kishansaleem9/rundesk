"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationConnectionsModule = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("../../../common/database/database.module");
const integration_connections_controller_1 = require("./integration-connections.controller");
const integration_connections_service_1 = require("./integration-connections.service");
const workspace_member_guard_1 = require("../../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../../auth/guards/workspace-admin.guard");
const security_module_1 = require("../../security/security.module");
const custom_roles_module_1 = require("../../custom-roles/custom-roles.module");
const notifications_module_1 = require("../../notifications/notifications.module");
const calendar_sync_module_1 = require("../../calendar-sync/calendar-sync.module");
let IntegrationConnectionsModule = class IntegrationConnectionsModule {
};
exports.IntegrationConnectionsModule = IntegrationConnectionsModule;
exports.IntegrationConnectionsModule = IntegrationConnectionsModule = __decorate([
    (0, common_1.Module)({
        // §V2-14 — a calendar grant is also recorded as the connecting person's own
        // account, so the callback needs CalendarAccountsService.
        imports: [database_module_1.DatabaseModule, security_module_1.SecurityModule, custom_roles_module_1.CustomRolesModule, notifications_module_1.NotificationsModule, calendar_sync_module_1.CalendarSyncModule],
        controllers: [integration_connections_controller_1.IntegrationConnectionsController],
        providers: [integration_connections_service_1.IntegrationConnectionsService, workspace_member_guard_1.WorkspaceMemberGuard, workspace_admin_guard_1.WorkspaceAdminGuard],
        exports: [integration_connections_service_1.IntegrationConnectionsService],
    })
], IntegrationConnectionsModule);
//# sourceMappingURL=integration-connections.module.js.map