"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TasksModule = void 0;
const common_1 = require("@nestjs/common");
const tasks_service_1 = require("./tasks.service");
const tasks_controller_1 = require("./tasks.controller");
const comments_controller_1 = require("./comments.controller");
const checklists_controller_1 = require("./checklists.controller");
const checklist_templates_controller_1 = require("./checklist-templates.controller");
const checklist_templates_service_1 = require("./checklist-templates.service");
const task_types_controller_1 = require("./task-types.controller");
const task_types_service_1 = require("./task-types.service");
const activity_controller_1 = require("./activity.controller");
const dependencies_controller_1 = require("./dependencies.controller");
const external_links_controller_1 = require("./external-links.controller");
const meetings_controller_1 = require("./meetings.controller");
const time_entries_controller_1 = require("./time-entries.controller");
const realtime_module_1 = require("../realtime/realtime.module");
const automations_module_1 = require("../automations/automations.module");
const webhooks_module_1 = require("../webhooks/webhooks.module");
const slack_module_1 = require("../integrations/slack/slack.module");
const notifications_module_1 = require("../notifications/notifications.module");
const calendar_sync_module_1 = require("../calendar-sync/calendar-sync.module");
const security_module_1 = require("../security/security.module");
const email_to_task_module_1 = require("../email-to-task/email-to-task.module");
const plans_module_1 = require("../plans/plans.module");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
let TasksModule = class TasksModule {
};
exports.TasksModule = TasksModule;
exports.TasksModule = TasksModule = __decorate([
    (0, common_1.Module)({
        imports: [
            realtime_module_1.RealtimeModule,
            automations_module_1.AutomationsModule,
            webhooks_module_1.WebhooksModule,
            slack_module_1.SlackModule,
            notifications_module_1.NotificationsModule,
            calendar_sync_module_1.CalendarSyncModule,
            security_module_1.SecurityModule,
            // §V2-08 — the task menu's "Send email to task" needs the address this
            // module already routes on.
            email_to_task_module_1.EmailToTaskModule,
            // §V2-13 frames `09:26` / `10:42` — Team View and the board download are
            // refused by the SERVER for a workspace whose plan does not include them.
            plans_module_1.PlansModule,
        ],
        providers: [tasks_service_1.TasksService, checklist_templates_service_1.ChecklistTemplatesService, task_types_service_1.TaskTypesService, workspace_member_guard_1.WorkspaceMemberGuard],
        controllers: [
            tasks_controller_1.TasksController,
            comments_controller_1.TaskCommentsController,
            comments_controller_1.SavedCommentsController,
            checklists_controller_1.TaskChecklistsController,
            checklist_templates_controller_1.ChecklistTemplatesController,
            task_types_controller_1.TaskTypesController,
            activity_controller_1.TaskActivityController,
            activity_controller_1.ProjectActivityController,
            dependencies_controller_1.TaskDependenciesController,
            external_links_controller_1.TaskExternalLinksController,
            meetings_controller_1.TaskMeetingsController,
            time_entries_controller_1.TaskTimeEntriesController,
            time_entries_controller_1.TimeEntriesController,
        ],
        exports: [tasks_service_1.TasksService],
    })
], TasksModule);
//# sourceMappingURL=tasks.module.js.map