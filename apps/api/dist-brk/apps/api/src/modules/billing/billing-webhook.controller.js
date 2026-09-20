"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingWebhookController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const billing_service_1 = require("./billing.service");
/**
 * Stripe webhook receiver (Plan §14.1). Separate controller so it carries NO
 * auth guard — Stripe calls it directly — while still being protected by HMAC
 * signature verification (STRIPE_WEBHOOK_SECRET) inside BillingService.
 *
 * RAW BODY: Stripe's signature is computed over the exact bytes of the request
 * body, so we must verify against the raw payload, NOT the JSON-parsed object.
 * The app is bootstrapped with `NestFactory.create(..., { rawBody: true })`
 * (see main.ts), which makes Nest's Fastify adapter buffer the untouched body
 * onto `req.rawBody` while leaving normal JSON parsing intact for every other
 * route. We read `req.rawBody` here and hand it to constructEvent verbatim.
 *
 * The global CSRF guard passes this through (POST, no bearer, no auth cookie),
 * and the route is exempt from JwtAuthGuard because this controller declares none.
 */
let BillingWebhookController = class BillingWebhookController {
    constructor(billing) {
        this.billing = billing;
    }
    async webhook(req, signature) {
        // Fall back to the JSON-serialized body only if rawBody is somehow absent;
        // in practice `{ rawBody: true }` guarantees the exact bytes are present.
        const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
        return this.billing.handleWebhook(raw, signature);
    }
};
exports.BillingWebhookController = BillingWebhookController;
__decorate([
    (0, common_1.Post)('webhook'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiExcludeEndpoint)(),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Headers)('stripe-signature')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], BillingWebhookController.prototype, "webhook", null);
exports.BillingWebhookController = BillingWebhookController = __decorate([
    (0, common_1.Controller)('billing'),
    __metadata("design:paramtypes", [billing_service_1.BillingService])
], BillingWebhookController);
//# sourceMappingURL=billing-webhook.controller.js.map