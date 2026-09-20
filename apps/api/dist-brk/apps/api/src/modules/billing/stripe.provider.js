"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeClientProvider = exports.STRIPE_CLIENT = void 0;
const config_1 = require("@nestjs/config");
const stripe_1 = __importDefault(require("stripe"));
const billing_constants_1 = require("./billing.constants");
/**
 * DI token for the Stripe SDK client. Resolves to `null` when STRIPE_SECRET_KEY
 * is not set, so BillingService can degrade gracefully ("billing not configured")
 * instead of throwing at construction time. Tests inject a fake in its place.
 */
exports.STRIPE_CLIENT = 'STRIPE_CLIENT';
exports.stripeClientProvider = {
    provide: exports.STRIPE_CLIENT,
    inject: [config_1.ConfigService],
    useFactory: (config) => {
        const { secretKey } = (0, billing_constants_1.readBillingConfig)((k) => config.get(k));
        if (!secretKey)
            return null;
        // No apiVersion override: pin to the version bundled with the installed SDK,
        // which keeps request/response types in sync with what we read below.
        return new stripe_1.default(secretKey);
    },
};
//# sourceMappingURL=stripe.provider.js.map