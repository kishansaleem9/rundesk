"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemindersModule = void 0;
const common_1 = require("@nestjs/common");
const task_reminders_service_1 = require("./task-reminders.service");
const reminders_controller_1 = require("./reminders.controller");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const notifications_module_1 = require("../notifications/notifications.module");
let RemindersModule = class RemindersModule {
};
exports.RemindersModule = RemindersModule;
exports.RemindersModule = RemindersModule = __decorate([
    (0, common_1.Module)({
        imports: [notifications_module_1.NotificationsModule],
        providers: [task_reminders_service_1.TaskRemindersService, workspace_member_guard_1.WorkspaceMemberGuard],
        controllers: [reminders_controller_1.RemindersController],
        exports: [task_reminders_service_1.TaskRemindersService],
    })
], RemindersModule);
//# sourceMappingURL=reminders.module.js.map