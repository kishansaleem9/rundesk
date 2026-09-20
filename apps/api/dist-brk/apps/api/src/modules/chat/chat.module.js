"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatModule = void 0;
const common_1 = require("@nestjs/common");
const chat_service_1 = require("./chat.service");
const chat_controller_1 = require("./chat.controller");
const realtime_module_1 = require("../realtime/realtime.module");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const notifications_module_1 = require("../notifications/notifications.module");
const tasks_module_1 = require("../tasks/tasks.module");
const reminders_module_1 = require("../reminders/reminders.module");
const presence_module_1 = require("../presence/presence.module");
const ai_module_1 = require("../ai/ai.module");
const storage_module_1 = require("../../common/storage/storage.module");
const shares_module_1 = require("../shares/shares.module");
const skills_module_1 = require("../skills/skills.module");
let ChatModule = class ChatModule {
};
exports.ChatModule = ChatModule;
exports.ChatModule = ChatModule = __decorate([
    (0, common_1.Module)({
        // SkillsModule supplies SkillsService so `/skill-name` in the composer can
        // answer AS that skill (§15). It owns the visibility, installed and enabled
        // checks, so resolving through it is what stops someone invoking a skill they
        // cannot see. Skills imports nothing from chat, so no cycle.
        imports: [realtime_module_1.RealtimeModule, notifications_module_1.NotificationsModule, tasks_module_1.TasksModule, reminders_module_1.RemindersModule, presence_module_1.PresenceModule, ai_module_1.AiModule, storage_module_1.StorageModule, shares_module_1.SharesModule, skills_module_1.SkillsModule],
        providers: [chat_service_1.ChatService, workspace_member_guard_1.WorkspaceMemberGuard],
        controllers: [chat_controller_1.ChatController],
        exports: [chat_service_1.ChatService],
    })
], ChatModule);
//# sourceMappingURL=chat.module.js.map