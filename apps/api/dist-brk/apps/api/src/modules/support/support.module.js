"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupportModule = void 0;
const common_1 = require("@nestjs/common");
const support_service_1 = require("./support.service");
const support_controller_1 = require("./support.controller");
const plans_module_1 = require("../plans/plans.module");
/**
 * Customer Support & Help Center (Plan §14.4). Human support (tickets + SLA) and
 * the public status page. Complements the AI help center in the AI module.
 * Imports PlansModule so ticket creation can gate on the workspace's plan tier
 * (paid-only) and scale SLA clocks by tier.
 */
let SupportModule = class SupportModule {
};
exports.SupportModule = SupportModule;
exports.SupportModule = SupportModule = __decorate([
    (0, common_1.Module)({
        imports: [plans_module_1.PlansModule],
        controllers: [support_controller_1.SupportController, support_controller_1.PublicStatusController],
        providers: [support_service_1.SupportService],
        exports: [support_service_1.SupportService],
    })
], SupportModule);
//# sourceMappingURL=support.module.js.map