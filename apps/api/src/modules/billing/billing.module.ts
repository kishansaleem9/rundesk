import { Module } from '@nestjs/common'
import { BillingService } from './billing.service'
import { BillingController } from './billing.controller'
import { BillingWebhookController } from './billing-webhook.controller'
import { stripeClientProvider } from './stripe.provider'
import { PlansModule } from '../plans/plans.module'
import { EmailModule } from '../email/email.module'
import { CustomRolesModule } from '../custom-roles/custom-roles.module'

/**
 * Stripe billing (Plan §14.1). Imports PlansModule so the webhook can sync
 * `workspaces.plan` (the bridge to plan-based feature gating) via
 * PlansService.setWorkspacePlan, and EmailModule so the invoice.paid webhook can
 * email a branded PDF receipt. The Stripe client is provided by a factory that
 * yields null when unconfigured, so the whole module degrades gracefully.
 */
@Module({
  // Custom roles: checkout, the portal and the invoices ask `workspace.billing`.
  imports: [PlansModule, EmailModule, CustomRolesModule],
  controllers: [BillingController, BillingWebhookController],
  providers: [BillingService, stripeClientProvider],
  exports: [BillingService],
})
export class BillingModule {}
