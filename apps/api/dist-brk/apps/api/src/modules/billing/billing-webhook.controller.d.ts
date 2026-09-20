import { RawBodyRequest } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { BillingService } from './billing.service';
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
export declare class BillingWebhookController {
    private readonly billing;
    constructor(billing: BillingService);
    webhook(req: RawBodyRequest<FastifyRequest>, signature: string): Promise<{
        received: true;
        type: string;
        handled: boolean;
    }>;
}
