import { Controller, Post, Req, Headers, HttpCode, RawBodyRequest } from '@nestjs/common'
import { ApiExcludeEndpoint } from '@nestjs/swagger'
import type { FastifyRequest } from 'fastify'
import { BillingService } from './billing.service'

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
@Controller('billing')
export class BillingWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async webhook(
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Headers('stripe-signature') signature: string,
  ) {
    // Fall back to the JSON-serialized body only if rawBody is somehow absent;
    // in practice `{ rawBody: true }` guarantees the exact bytes are present.
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}))
    return this.billing.handleWebhook(raw, signature)
  }
}
