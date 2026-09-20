/**
 * Stripe billing (Plan §14.1). Imports PlansModule so the webhook can sync
 * `workspaces.plan` (the bridge to plan-based feature gating) via
 * PlansService.setWorkspacePlan, and EmailModule so the invoice.paid webhook can
 * email a branded PDF receipt. The Stripe client is provided by a factory that
 * yields null when unconfigured, so the whole module degrades gracefully.
 */
export declare class BillingModule {
}
