import { Module } from '@nestjs/common'
import { BillingService } from './billing.service'
import { BillingController } from './billing.controller'
import { BillingWebhookController } from './billing-webhook.controller'
import { stripeClientProvider } from './stripe.provider'
import { PlansModule } from '../plans/plans.module'

/**
 * Stripe billing (Plan §14.1). Imports PlansModule so the webhook can sync
 * `workspaces.plan` (the bridge to plan-based feature gating) via
 * PlansService.setWorkspacePlan. The Stripe client is provided by a factory that
 * yields null when unconfigured, so the whole module degrades gracefully.
 */
@Module({
  imports: [PlansModule],
  controllers: [BillingController, BillingWebhookController],
  providers: [BillingService, stripeClientProvider],
  exports: [BillingService],
})
export class BillingModule {}
