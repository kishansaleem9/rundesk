"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailToTaskModule = void 0;
const common_1 = require("@nestjs/common");
const email_to_task_service_1 = require("./email-to-task.service");
const email_to_task_controller_1 = require("./email-to-task.controller");
const storage_module_1 = require("../../common/storage/storage.module");
const realtime_module_1 = require("../realtime/realtime.module");
let EmailToTaskModule = class EmailToTaskModule {
};
exports.EmailToTaskModule = EmailToTaskModule;
exports.EmailToTaskModule = EmailToTaskModule = __decorate([
    (0, common_1.Module)({
        imports: [storage_module_1.StorageModule, realtime_module_1.RealtimeModule],
        providers: [email_to_task_service_1.EmailToTaskService],
        controllers: [email_to_task_controller_1.EmailAliasController, email_to_task_controller_1.InboundEmailController],
        exports: [email_to_task_service_1.EmailToTaskService],
    })
], EmailToTaskModule);
//# sourceMappingURL=email-to-task.module.js.map