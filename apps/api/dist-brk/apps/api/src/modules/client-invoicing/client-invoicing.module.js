"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientInvoicingModule = void 0;
const common_1 = require("@nestjs/common");
const client_invoicing_service_1 = require("./client-invoicing.service");
const client_invoicing_controller_1 = require("./client-invoicing.controller");
const database_module_1 = require("../../common/database/database.module");
const workspace_member_guard_1 = require("../auth/guards/workspace-member.guard");
const custom_roles_module_1 = require("../custom-roles/custom-roles.module");
const stripe_provider_1 = require("../billing/stripe.provider");
/**
 * §12.10 Client invoicing. Generates client-facing invoices from a project's
 * billable time entries and (env-gated) pushes them to Stripe.
 *
 * Mirrors the reports module's wiring: DatabaseModule for the Drizzle client,
 * CustomRolesModule for PermissionsGuard, and a locally-provided
 * WorkspaceMemberGuard. `stripeClientProvider` (reused from the billing module)
 * supplies the STRIPE_CLIENT token — null when STRIPE_SECRET_KEY is unset — so
 * the Stripe push degrades gracefully.
 */
let ClientInvoicingModule = class ClientInvoicingModule {
};
exports.ClientInvoicingModule = ClientInvoicingModule;
exports.ClientInvoicingModule = ClientInvoicingModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule, custom_roles_module_1.CustomRolesModule],
        controllers: [client_invoicing_controller_1.ClientInvoicingController],
        providers: [client_invoicing_service_1.ClientInvoicingService, workspace_member_guard_1.WorkspaceMemberGuard, stripe_provider_1.stripeClientProvider],
    })
], ClientInvoicingModule);
//# sourceMappingURL=client-invoicing.module.js.map