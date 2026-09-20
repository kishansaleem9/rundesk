"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomFieldsModule = void 0;
const common_1 = require("@nestjs/common");
const custom_fields_service_1 = require("./custom-fields.service");
const custom_fields_controller_1 = require("./custom-fields.controller");
const database_module_1 = require("../../common/database/database.module");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
let CustomFieldsModule = class CustomFieldsModule {
};
exports.CustomFieldsModule = CustomFieldsModule;
exports.CustomFieldsModule = CustomFieldsModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule],
        controllers: [custom_fields_controller_1.CustomFieldsController],
        providers: [custom_fields_service_1.CustomFieldsService, workspace_member_guard_1.WorkspaceMemberGuard],
        exports: [custom_fields_service_1.CustomFieldsService],
    })
], CustomFieldsModule);
//# sourceMappingURL=custom-fields.module.js.map