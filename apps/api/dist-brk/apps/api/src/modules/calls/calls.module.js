"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallsModule = void 0;
const common_1 = require("@nestjs/common");
const calls_service_1 = require("./calls.service");
const calls_controller_1 = require("./calls.controller");
const realtime_module_1 = require("../realtime/realtime.module");
const meetings_module_1 = require("../meetings/meetings.module");
const notifications_module_1 = require("../notifications/notifications.module");
const ai_module_1 = require("../ai/ai.module");
const storage_module_1 = require("../../common/storage/storage.module");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
let CallsModule = class CallsModule {
};
exports.CallsModule = CallsModule;
exports.CallsModule = CallsModule = __decorate([
    (0, common_1.Module)({
        // MeetingsModule so a call that ends leaves a meeting record behind rather
        // than a second, parallel history of its own. NotificationsModule so §2.8
        // gap 9's "a call started, here is the way in" reaches people who are not
        // looking at the channel.
        // §2.8 gap 10 — AiModule writes the notes from the transcript; StorageModule
        // hands the browser a pre-signed URL so the recording never passes through
        // the API on its way to storage.
        imports: [realtime_module_1.RealtimeModule, meetings_module_1.MeetingsModule, notifications_module_1.NotificationsModule, ai_module_1.AiModule, storage_module_1.StorageModule],
        providers: [calls_service_1.CallsService, workspace_member_guard_1.WorkspaceMemberGuard],
        controllers: [calls_controller_1.CallsController],
        exports: [calls_service_1.CallsService],
    })
], CallsModule);
//# sourceMappingURL=calls.module.js.map