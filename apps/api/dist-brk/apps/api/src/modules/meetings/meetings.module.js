"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeetingsModule = void 0;
const common_1 = require("@nestjs/common");
// §2.8 gap 10 — a call's recording is stored by key and signed on read.
const storage_module_1 = require("../../common/storage/storage.module");
const meetings_service_1 = require("./meetings.service");
const meetings_controller_1 = require("./meetings.controller");
const ai_module_1 = require("../ai/ai.module");
const tasks_module_1 = require("../tasks/tasks.module");
let MeetingsModule = class MeetingsModule {
};
exports.MeetingsModule = MeetingsModule;
exports.MeetingsModule = MeetingsModule = __decorate([
    (0, common_1.Module)({
        imports: [storage_module_1.StorageModule, ai_module_1.AiModule, tasks_module_1.TasksModule],
        providers: [meetings_service_1.MeetingsService],
        controllers: [meetings_controller_1.MeetingsController],
        exports: [meetings_service_1.MeetingsService],
    })
], MeetingsModule);
//# sourceMappingURL=meetings.module.js.map