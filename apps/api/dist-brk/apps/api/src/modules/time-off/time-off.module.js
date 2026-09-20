"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeOffModule = void 0;
const common_1 = require("@nestjs/common");
const time_off_service_1 = require("./time-off.service");
const time_off_controller_1 = require("./time-off.controller");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
let TimeOffModule = class TimeOffModule {
};
exports.TimeOffModule = TimeOffModule;
exports.TimeOffModule = TimeOffModule = __decorate([
    (0, common_1.Module)({
        providers: [time_off_service_1.TimeOffService, workspace_member_guard_1.WorkspaceMemberGuard],
        controllers: [time_off_controller_1.TimeOffController],
        exports: [time_off_service_1.TimeOffService],
    })
], TimeOffModule);
//# sourceMappingURL=time-off.module.js.map