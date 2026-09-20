"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FormsModule = void 0;
const common_1 = require("@nestjs/common");
const forms_service_1 = require("./forms.service");
const forms_controller_1 = require("./forms.controller");
const database_module_1 = require("../../common/database/database.module");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const workspace_admin_guard_1 = require("../auth/guards/workspace-admin.guard");
const webhooks_module_1 = require("../webhooks/webhooks.module");
const rate_limit_guard_1 = require("../../common/guards/rate-limit.guard");
let FormsModule = class FormsModule {
};
exports.FormsModule = FormsModule;
exports.FormsModule = FormsModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule, webhooks_module_1.WebhooksModule],
        controllers: [forms_controller_1.WorkspaceFormsController, forms_controller_1.PublicFormsController],
        providers: [forms_service_1.FormsService, workspace_member_guard_1.WorkspaceMemberGuard, workspace_admin_guard_1.WorkspaceAdminGuard, rate_limit_guard_1.RateLimitGuard],
        exports: [forms_service_1.FormsService],
    })
], FormsModule);
//# sourceMappingURL=forms.module.js.map