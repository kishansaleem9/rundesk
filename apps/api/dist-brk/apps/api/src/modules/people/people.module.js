"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PeopleModule = void 0;
const common_1 = require("@nestjs/common");
const people_service_1 = require("./people.service");
const people_controller_1 = require("./people.controller");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const ai_module_1 = require("../ai/ai.module");
const calendar_sync_module_1 = require("../calendar-sync/calendar-sync.module");
/**
 * §G06 [05:35–06:35] — the person profile panel and the priorities behind it.
 *
 * AiModule is imported for §G05's "Get StandUp", which asks a model to write up
 * what this module has already gathered. No cycle: nothing in AiModule's import
 * chain — Tasks, Notifications, Plans, Search, Skills, Docs — reaches People.
 *
 * CalendarSyncModule is §V2-14c's: a person's calendar view has to know when
 * they are busy according to the calendars they nominated, not only according
 * to Rundesk. It imports nothing itself, so there is no cycle to reason about.
 */
let PeopleModule = class PeopleModule {
};
exports.PeopleModule = PeopleModule;
exports.PeopleModule = PeopleModule = __decorate([
    (0, common_1.Module)({
        imports: [ai_module_1.AiModule, calendar_sync_module_1.CalendarSyncModule],
        providers: [people_service_1.PeopleService, workspace_member_guard_1.WorkspaceMemberGuard],
        controllers: [people_controller_1.PeopleController, people_controller_1.PrioritiesController],
        exports: [people_service_1.PeopleService],
    })
], PeopleModule);
//# sourceMappingURL=people.module.js.map