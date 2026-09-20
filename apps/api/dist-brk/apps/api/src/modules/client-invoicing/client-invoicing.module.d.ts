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
export declare class ClientInvoicingModule {
}
