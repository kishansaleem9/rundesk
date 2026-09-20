"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingModule = void 0;
const common_1 = require("@nestjs/common");
const billing_service_1 = require("./billing.service");
const billing_controller_1 = require("./billing.controller");
const billing_webhook_controller_1 = require("./billing-webhook.controller");
const stripe_provider_1 = require("./stripe.provider");
const plans_module_1 = require("../plans/plans.module");
const email_module_1 = require("../email/email.module");
/**
 * Stripe billing (Plan §14.1). Imports PlansModule so the webhook can sync
 * `workspaces.plan` (the bridge to plan-based feature gating) via
 * PlansService.setWorkspacePlan, and EmailModule so the invoice.paid webhook can
 * email a branded PDF receipt. The Stripe client is provided by a factory that
 * yields null when unconfigured, so the whole module degrades gracefully.
 */
let BillingModule = class BillingModule {
};
exports.BillingModule = BillingModule;
exports.BillingModule = BillingModule = __decorate([
    (0, common_1.Module)({
        imports: [plans_module_1.PlansModule, email_module_1.EmailModule],
        controllers: [billing_controller_1.BillingController, billing_webhook_controller_1.BillingWebhookController],
        providers: [billing_service_1.BillingService, stripe_provider_1.stripeClientProvider],
        exports: [billing_service_1.BillingService],
    })
], BillingModule);
//# sourceMappingURL=billing.module.js.map