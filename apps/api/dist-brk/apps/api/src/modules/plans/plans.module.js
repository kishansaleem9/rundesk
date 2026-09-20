"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlansModule = void 0;
const common_1 = require("@nestjs/common");
const plans_service_1 = require("./plans.service");
const plan_feature_guard_1 = require("./plan-feature.guard");
const plan_requests_controller_1 = require("./plan-requests.controller");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const notifications_module_1 = require("../notifications/notifications.module");
/**
 * Commercial plan model + feature gating (Plan §14.1). Exports both the service
 * (imperative limit/feature checks) and the guard (declarative @RequirePlan) so
 * any feature module can import PlansModule and use either. Depends only on the
 * global DatabaseModule, so it introduces no dependency cycles.
 */
let PlansModule = class PlansModule {
};
exports.PlansModule = PlansModule;
exports.PlansModule = PlansModule = __decorate([
    (0, common_1.Module)({
        // §V2-13 frame `09:26` — the paywall's "Contact your admin" needs somewhere
        // to send the ask. NotificationsModule imports only Realtime + Email, so this
        // stays cycle-free.
        imports: [notifications_module_1.NotificationsModule],
        providers: [plans_service_1.PlansService, plan_feature_guard_1.PlanFeatureGuard, workspace_member_guard_1.WorkspaceMemberGuard],
        controllers: [plan_requests_controller_1.PlanRequestsController],
        exports: [plans_service_1.PlansService, plan_feature_guard_1.PlanFeatureGuard],
    })
], PlansModule);
//# sourceMappingURL=plans.module.js.map